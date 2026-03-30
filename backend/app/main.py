from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
import websockets

from app.models.asr_adapter_schemas import AudioData
from app.models.schemas import (
    Asr2PassConfig,
    AsrFileAsrResponse,
    AsrFileShapeResponse,
    AsrStreamInit,
    LLMConfig,
    LLMTestResponse,
    PresetSkill,
    PostProcessParams,
    ProcessRequest,
    ShapeResponse,
    ShapeTokensUsed,
)
from app.prompt_builder import build_messages
from app.presets.loader import load_preset_skills
from app.services.asr_2pass import (
    parse_wav_pcm16_mono,
    resample_pcm16le_mono,
)
from app.services.asr_2pass_model import TwoPassInput, TwoPassOutput
from app.services.asr_hotwords import merge_hotwords_json_with_lexicon, parse_lexicon_json
from app.services.asr_registry import get_asr_model
from app.services.llm_client import create_llm_client, chat_completion
from app.utils.text import strip_trailing_period


app = FastAPI(title="EchoShaper ASR Text Shaper", version="0.1.0")


_PRESETS_PATH = Path(__file__).resolve().parent / "presets" / "presets.yaml"
_preset_skills: dict[str, PresetSkill] = {}


@app.on_event("startup")
async def _startup() -> None:
    global _preset_skills
    _preset_skills = load_preset_skills(_PRESETS_PATH)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/v1/llm/test", response_model=LLMTestResponse)
async def llm_test(payload: LLMConfig) -> LLMTestResponse:
    """
    大模型连通性测试：向 `v1/chat/completions` 发极简消息。
    """
    messages = [{"role": "user", "content": "Hello"}]
    client = create_llm_client(payload.base_url, payload.api_key)

    start = time.perf_counter()
    try:
        _resp = await chat_completion(client, payload.model_name, messages)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=400, detail=f"LLM test failed: {e}") from e
    latency_ms = int((time.perf_counter() - start) * 1000)

    connected_message = f"Model {payload.model_name} is connected successfully."
    return LLMTestResponse(status="success", latency_ms=latency_ms, message=connected_message)


def _extract_content(resp: dict) -> str:
    choices = resp.get("choices") or []
    if not choices:
        return ""
    first = choices[0] or {}
    msg = first.get("message") or {}
    content = msg.get("content")
    return content if isinstance(content, str) else ""


async def _shape_raw_text(request: ProcessRequest) -> ShapeResponse:
    messages = build_messages(request, _preset_skills)

    client = create_llm_client(request.llm_config.base_url, request.llm_config.api_key)

    start = time.perf_counter()
    try:
        resp = await chat_completion(client, request.llm_config.model_name, messages)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"LLM shape failed: {e}") from e
    _latency_ms = int((time.perf_counter() - start) * 1000)

    result_text = _extract_content(resp)
    if not isinstance(result_text, str) or not result_text.strip():
        raise HTTPException(status_code=400, detail="LLM returned empty result_text.")

    should_strip = ("remove_trailing_period" in request.preset_skills) or any(
        (s.name == "remove_trailing_period") for s in request.custom_skills
    )
    if should_strip:
        result_text = strip_trailing_period(result_text)

    usage = resp.get("usage") or {}
    tokens = ShapeTokensUsed(
        prompt=int(usage.get("prompt_tokens") or 0),
        completion=int(usage.get("completion_tokens") or 0),
        total=int(usage.get("total_tokens") or 0),
    )

    original_length = len(request.raw_text)
    processed_length = len(result_text)
    return ShapeResponse(
        status="success",
        original_length=original_length,
        processed_length=processed_length,
        result_text=result_text,
        tokens_used=tokens,
        latency_ms=_latency_ms,
    )


@app.post("/api/v1/text/shape", response_model=ShapeResponse)
async def text_shape(request: ProcessRequest) -> ShapeResponse:
    return await _shape_raw_text(request)


async def _ws_send_json(ws: WebSocket, obj: dict[str, Any]) -> None:
    await ws.send_text(json.dumps(obj, ensure_ascii=False))


def _parse_json_or_none(raw: Optional[str]) -> Optional[dict[str, Any]]:
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        return None
    return json.loads(raw)


def _parse_lexicon_or_empty(raw: Optional[str]) -> list[str]:
    if raw is None:
        return []
    text = raw.strip()
    if not text:
        return []
    return parse_lexicon_json(text)


@app.post("/api/v1/asr/file/asr", response_model=AsrFileAsrResponse)
async def asr_file_asr(
    file: UploadFile = File(...),
    asr_config: Optional[str] = Form(default=None),
    lexicon: Optional[str] = Form(default=None),
) -> AsrFileAsrResponse:
    content = await file.read()
    parsed = parse_wav_pcm16_mono(content)

    sr = parsed.sample_rate
    pcm = parsed.pcm_bytes
    try:
        pcm = resample_pcm16le_mono(pcm, src_rate_hz=sr, dst_rate_hz=8000)
        sr = 8000
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"音频重采样失败（需要 PCM16 单声道 WAV）：{parsed.sample_rate} Hz -> 8000 Hz，{e}",
        ) from e

    cfg_obj = _parse_json_or_none(asr_config) or {}
    cfg = TwoPassInput.model_validate(cfg_obj)
    try:
        lexicon_words = _parse_lexicon_or_empty(lexicon)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"lexicon JSON 不合法: {e}") from e
    cfg.hotwords = merge_hotwords_json_with_lexicon(cfg.hotwords, lexicon_words)
    wav_name = cfg.wav_name or uuid.uuid4().hex
    cfg.wav_name = wav_name

    try:
        asr_model = get_asr_model(cfg.asr_model_name)
        asr_output = await asr_model.run(
            AudioData(pcm_bytes=pcm, sample_rate_hz=sr),
            cfg,
            TwoPassOutput,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ASR failed ({type(e).__name__}): {e}") from e

    return AsrFileAsrResponse(
        wav_name=wav_name,
        asr_text=asr_output.text or "",
        raw_offline=asr_output.raw_offline or {},
    )


@app.post("/api/v1/asr/file", response_model=AsrFileShapeResponse)
async def asr_file_shape(
    file: UploadFile = File(...),
    postprocess: str = Form(...),
    asr_config: Optional[str] = Form(default=None),
) -> AsrFileShapeResponse:
    content = await file.read()
    parsed = parse_wav_pcm16_mono(content)

    sr = parsed.sample_rate
    pcm = parsed.pcm_bytes
    try:
        pcm = resample_pcm16le_mono(pcm, src_rate_hz=sr, dst_rate_hz=8000)
        sr = 8000
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"音频重采样失败（需要 PCM16 单声道 WAV）：{parsed.sample_rate} Hz -> 8000 Hz，{e}",
        ) from e

    try:
        pp = PostProcessParams.model_validate_json(postprocess)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"postprocess JSON 不合法: {e}") from e

    cfg_obj = _parse_json_or_none(asr_config) or {}
    cfg = TwoPassInput.model_validate(cfg_obj)
    cfg.hotwords = merge_hotwords_json_with_lexicon(cfg.hotwords, pp.lexicon)
    wav_name = cfg.wav_name or uuid.uuid4().hex
    cfg.wav_name = wav_name

    try:
        asr_model = get_asr_model(cfg.asr_model_name)
        asr_output = await asr_model.run(
            AudioData(pcm_bytes=pcm, sample_rate_hz=sr),
            cfg,
            TwoPassOutput,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"ASR failed ({type(e).__name__}): {e}") from e

    asr_text = asr_output.text
    raw_offline = asr_output.raw_offline
    if not (asr_text and asr_text.strip()):
        raise HTTPException(status_code=400, detail="ASR 返回空文本，无法后处理")

    req = ProcessRequest(
        raw_text=asr_text,
        llm_config=pp.llm_config,
        preset_skills=pp.preset_skills,
        custom_skills=pp.custom_skills,
        lexicon=pp.lexicon,
        personal_preference=pp.personal_preference,
    )
    shaped = await _shape_raw_text(req)

    return AsrFileShapeResponse(
        wav_name=wav_name,
        asr_text=asr_text,
        raw_offline=raw_offline or {},
        shape=shaped,
    )


@app.websocket("/api/v1/asr/stream")
async def asr_stream(ws: WebSocket) -> None:
    await ws.accept()

    remote_ws: Optional[websockets.WebSocketClientProtocol] = None

    try:
        init_raw = await ws.receive_text()
        init_obj = AsrStreamInit.model_validate_json(init_raw)

        session_id = init_obj.asr_config.wav_name or uuid.uuid4().hex
        asr_input = TwoPassInput.model_validate(init_obj.asr_config.model_dump())
        asr_input.hotwords = merge_hotwords_json_with_lexicon(asr_input.hotwords, init_obj.postprocess.lexicon)
        asr_input.wav_name = session_id
        asr_model = get_asr_model(asr_input.asr_model_name)
        remote_url = asr_model.stream_remote_url(asr_input)
        asr_cfg = asr_model.build_stream_init_payload(asr_input, session_id=session_id)

        remote_ws = await websockets.connect(
            remote_url,
            ping_interval=30,
            ping_timeout=10,
            close_timeout=10,
            max_size=2**20,
            max_queue=32,
        )
        await remote_ws.send(json.dumps(asr_cfg, ensure_ascii=False))
        await _ws_send_json(
            ws,
            {
                "type": "asr.started",
                "session_id": session_id,
                "remote_url": remote_url,
            },
        )

        stop_requested = asyncio.Event()
        offline_queue: asyncio.Queue[str] = asyncio.Queue()
        shaping_lock = asyncio.Lock()

        async def _client_to_remote() -> None:
            nonlocal remote_ws
            assert remote_ws is not None
            while True:
                msg = await ws.receive()
                mtype = msg.get("type")
                if mtype == "websocket.disconnect":
                    stop_requested.set()
                    return
                if mtype == "websocket.receive":
                    if msg.get("bytes") is not None:
                        await remote_ws.send(msg["bytes"])
                    elif msg.get("text") is not None:
                        try:
                            data = json.loads(msg["text"])
                        except json.JSONDecodeError:
                            continue
                        if data.get("type") == "stop":
                            stop_requested.set()
                            try:
                                await remote_ws.send(json.dumps({"is_speaking": False}, ensure_ascii=False))
                            except Exception:
                                pass
                            return

        async def _remote_to_client() -> None:
            nonlocal remote_ws
            assert remote_ws is not None
            async for raw in remote_ws:
                if isinstance(raw, bytes):
                    continue
                try:
                    data = json.loads(raw)
                except json.JSONDecodeError:
                    continue

                evt_type, payload = asr_model.parse_stream_message(data)
                if evt_type == "partial":
                    text = str(payload or "")
                    await _ws_send_json(ws, {"type": "asr.partial", "text": text})
                elif evt_type == "final":
                    text = str(payload or "")
                    await _ws_send_json(ws, {"type": "asr.final", "text": text})
                    if text and str(text).strip():
                        await offline_queue.put(str(text))
                else:
                    await _ws_send_json(ws, {"type": "asr.message", "raw": payload})

        async def _shape_loop() -> None:
            while not stop_requested.is_set():
                try:
                    text = await asyncio.wait_for(offline_queue.get(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                final_text = (text or "").strip()
                if not final_text:
                    continue
                async with shaping_lock:
                    req = ProcessRequest(
                        raw_text=final_text,
                        llm_config=init_obj.postprocess.llm_config,
                        preset_skills=init_obj.postprocess.preset_skills,
                        custom_skills=init_obj.postprocess.custom_skills,
                        lexicon=init_obj.postprocess.lexicon,
                        personal_preference=init_obj.postprocess.personal_preference,
                    )
                    try:
                        shaped = await _shape_raw_text(req)
                        await _ws_send_json(ws, {"type": "shape.result", "data": shaped.model_dump()})
                    except HTTPException as e:
                        detail = str(e.detail)
                        if "empty result_text" in detail:
                            await _ws_send_json(
                                ws,
                                {
                                    "type": "shape.skipped",
                                    "reason": "empty_llm_result",
                                    "message": detail,
                                    "source_text": final_text,
                                },
                            )
                            continue
                        await _ws_send_json(
                            ws,
                            {"type": "shape.error", "message": detail, "source_text": final_text},
                        )
                    except Exception as e:
                        await _ws_send_json(
                            ws,
                            {"type": "shape.error", "message": str(e), "source_text": final_text},
                        )

        client_task = asyncio.create_task(_client_to_remote())
        remote_task = asyncio.create_task(_remote_to_client())
        shape_task = asyncio.create_task(_shape_loop())

        done, pending = await asyncio.wait(  # noqa: F841
            {client_task, remote_task, shape_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for t in done:
            if t.cancelled():
                continue
            exc = t.exception()
            if exc is not None:
                try:
                    await _ws_send_json(ws, {"type": "error", "message": str(exc)})
                except Exception:
                    pass
        for t in pending:
            t.cancel()

    except WebSocketDisconnect:
        return
    except Exception as e:
        try:
            await _ws_send_json(ws, {"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        if remote_ws is not None:
            try:
                await remote_ws.close()
            except Exception:
                pass


_FRONTEND_DIST_DIR_BACKEND = Path(__file__).resolve().parent.parent / "frontend_dist"
_FRONTEND_DIST_DIR_REPO = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
_frontend_dist_dir = (
    _FRONTEND_DIST_DIR_BACKEND if _FRONTEND_DIST_DIR_BACKEND.exists() else _FRONTEND_DIST_DIR_REPO
)

if _frontend_dist_dir.exists():
    # Serve the built frontend at `/` (e.g. GET / -> index.html).
    # `html=True` ensures SPA routes fall back to `index.html` instead of 404.
    app.mount(
        "/",
        StaticFiles(directory=str(_frontend_dist_dir), html=True),
        name="frontend",
    )

