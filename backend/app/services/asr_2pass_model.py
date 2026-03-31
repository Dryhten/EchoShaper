from __future__ import annotations

import json
import uuid
from typing import Any

from pydantic import Field

from app.models.asr_adapter_schemas import AsrModelOutput, AudioData
from app.models.asr_model_names import AsrModelName, DEFAULT_ASR_MODEL_NAME
from app.models.schemas import Asr2PassConfig
from app.services.asr_2pass import run_2pass_asr
from app.services.asr_model_base import BaseAsrModel


class TwoPassInput(Asr2PassConfig):
    asr_model_name: AsrModelName = DEFAULT_ASR_MODEL_NAME
    wav_name: str = Field(default_factory=lambda: uuid.uuid4().hex)


class TwoPassOutput(AsrModelOutput):
    raw_offline: dict[str, Any] = Field(default_factory=dict)


class TwoPassWsAsrModel(BaseAsrModel[TwoPassInput, TwoPassOutput]):
    @property
    def model_name(self) -> str:
        return "two_pass_ws"

    async def call_model(self, audio: AudioData, model_input: TwoPassInput) -> dict[str, Any]:
        audio_s = len(audio.pcm_bytes) / float(audio.sample_rate_hz * 2)
        timeout_s = max(45.0, audio_s * 6.0 + 15.0)
        text, raw_offline = await run_2pass_asr(
            audio.pcm_bytes,
            wav_name=model_input.wav_name,
            sample_rate_hz=audio.sample_rate_hz,
            config=model_input,
            remote_url=model_input.remote_url,
            timeout_s=timeout_s,
        )
        return {
            "text": text or "",
            "raw": raw_offline or {},
            "raw_offline": raw_offline or {},
        }

    def stream_remote_url(self, model_input: TwoPassInput) -> str:
        return model_input.remote_url

    def build_stream_init_payload(self, model_input: TwoPassInput, *, session_id: str) -> dict[str, Any]:
        asr_cfg = model_input.model_dump()
        asr_cfg.pop("asr_model_name", None)
        asr_cfg["wav_name"] = session_id
        if not asr_cfg.get("hotwords"):
            asr_cfg["hotwords"] = json.dumps({"警官": 36, "民警": 36, "处警": 30}, ensure_ascii=False)
        return asr_cfg

    def parse_stream_message(self, data: dict[str, Any]) -> tuple[str, Any]:
        mode = data.get("mode")
        text = data.get("text") or ""
        if mode == "2pass-online":
            return "partial", text
        if mode == "2pass-offline":
            return "final", text
        return "message", data

