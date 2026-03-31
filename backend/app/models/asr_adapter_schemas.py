from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.asr_model_names import AsrModelName, DEFAULT_ASR_MODEL_NAME


class AudioData(BaseModel):
    pcm_bytes: bytes
    sample_rate_hz: int
    format: Literal["pcm16le_mono"] = "pcm16le_mono"


class AsrModelInput(BaseModel):
    asr_model_name: AsrModelName = DEFAULT_ASR_MODEL_NAME


class AsrModelOutput(BaseModel):
    text: str = ""
    raw: dict[str, Any] = Field(default_factory=dict)

