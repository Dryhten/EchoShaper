from __future__ import annotations

import asyncio
import json
import array
import math
import wave
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Optional

import websockets

from app.models.schemas import Asr2PassConfig


@dataclass(frozen=True)
class ParsedWavPcm:
    pcm_bytes: bytes
    sample_rate: int


def parse_wav_pcm16_mono(content: bytes) -> ParsedWavPcm:
    with wave.open(BytesIO(content), "rb") as wf:
        channels = wf.getnchannels()
        sampwidth = wf.getsampwidth()
        framerate = wf.getframerate()
        if channels != 1:
            raise ValueError(f"WAV 仅支持单声道（nchannels=1），当前为 {channels}")
        if sampwidth != 2:
            raise ValueError(f"WAV 仅支持 PCM16（sampwidth=2），当前为 {sampwidth}")
        frames = wf.readframes(wf.getnframes())
    return ParsedWavPcm(pcm_bytes=frames, sample_rate=int(framerate))


def downsample_16k_to_8k_pcm16le_mono(pcm16le: bytes) -> bytes:
    if len(pcm16le) % 2 != 0:
        pcm16le = pcm16le[: len(pcm16le) - 1]
    out = bytearray()
    # 每两个 int16 取一个
    for i in range(0, len(pcm16le), 4):
        out.extend(pcm16le[i : i + 2])
    return bytes(out)


def resample_pcm16le_mono(pcm16le: bytes, *, src_rate_hz: int, dst_rate_hz: int = 8000) -> bytes:
    """
    将 PCM16LE 单声道从任意采样率重采样到目标采样率（默认 8k）。
    """
    src = int(src_rate_hz)
    dst = int(dst_rate_hz)
    if src <= 0 or dst <= 0:
        raise ValueError(f"非法采样率：src={src_rate_hz}, dst={dst_rate_hz}")
    if src == dst:
        return pcm16le

    if len(pcm16le) % 2 != 0:
        pcm16le = pcm16le[: len(pcm16le) - 1]

    if not pcm16le:
        return pcm16le

    samples = array.array("h")
    samples.frombytes(pcm16le)
    in_len = len(samples)
    if in_len <= 1:
        return pcm16le

    out_len = max(1, int(math.floor(in_len * (dst / src))))
    out = array.array("h", [0] * out_len)
    ratio = src / dst

    for i in range(out_len):
        x = i * ratio
        x0 = int(math.floor(x))
        x1 = min(x0 + 1, in_len - 1)
        frac = x - x0
        s0 = samples[x0]
        s1 = samples[x1]
        v = int(round(s0 * (1.0 - frac) + s1 * frac))
        if v > 32767:
            v = 32767
        elif v < -32768:
            v = -32768
        out[i] = v

    return out.tobytes()


def _chunk_bytes_for_interval_ms(sample_rate_hz: int, interval_ms: int) -> int:
    interval_ms = int(interval_ms)
    if interval_ms <= 0:
        interval_ms = 10
    samples = int(sample_rate_hz * (interval_ms / 1000.0))
    if samples <= 0:
        samples = 80
    return samples * 2  # int16


async def run_2pass_asr(
    pcm_bytes: bytes,
    *,
    wav_name: str,
    sample_rate_hz: int,
    config: Asr2PassConfig,
    remote_url: str = "ws://116.136.189.9:10095",
    timeout_s: float = 45.0,
) -> tuple[str, dict[str, Any]]:
    """
    2PASS 协议：
    - 首包 JSON config（wav_format=pcm）
    - 音频 bytes（PCM16LE mono）
    - 结束包 {"is_speaking": false}
    - 等待 mode=2pass-offline 的最终结果
    """
    cfg = config.model_dump()
    cfg.pop("asr_model_name", None)
    cfg["wav_name"] = wav_name
    cfg["wav_format"] = "pcm"
    cfg["mode"] = "2pass"

    if not cfg.get("hotwords"):
        cfg["hotwords"] = json.dumps({}, ensure_ascii=False)

    chunk_bytes = _chunk_bytes_for_interval_ms(sample_rate_hz, cfg.get("chunk_interval", 10))

    offline_text = ""
    offline_msg: dict[str, Any] = {}

    async with websockets.connect(
        remote_url,
        ping_interval=30,
        ping_timeout=10,
        close_timeout=10,
        max_size=2**20,
        max_queue=32,
        open_timeout=15,
    ) as ws:
        await ws.send(json.dumps(cfg, ensure_ascii=False))

        for i in range(0, len(pcm_bytes), chunk_bytes):
            await ws.send(pcm_bytes[i : i + chunk_bytes])
            await asyncio.sleep(0)

        await ws.send(json.dumps({"is_speaking": False}, ensure_ascii=False))

        async def _wait_offline() -> None:
            nonlocal offline_text, offline_msg
            async for raw in ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                if data.get("mode") == "2pass-offline":
                    offline_msg = data if isinstance(data, dict) else {}
                    t = offline_msg.get("text")
                    offline_text = t if isinstance(t, str) else ""
                    return

        await asyncio.wait_for(_wait_offline(), timeout=timeout_s)

    return offline_text, offline_msg

