from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field

from app.models.asr_model_names import AsrModelName, DEFAULT_ASR_MODEL_NAME


class LLMConfig(BaseModel):
    model_name: str
    base_url: str
    api_key: str


class CustomSkill(BaseModel):
    name: str
    description: str
    instruction: str


class PresetSkill(BaseModel):
    description: str
    instruction: str


class ProcessRequest(BaseModel):
    raw_text: str
    llm_config: LLMConfig
    preset_skills: list[str] = Field(default_factory=list)
    custom_skills: list[CustomSkill] = Field(default_factory=list)
    lexicon: list[str] = Field(default_factory=list)
    personal_preference: str = ""


class PostProcessParams(BaseModel):
    llm_config: LLMConfig
    preset_skills: list[str] = Field(default_factory=list)
    custom_skills: list[CustomSkill] = Field(default_factory=list)
    lexicon: list[str] = Field(default_factory=list)
    personal_preference: str = ""


class Asr2PassConfig(BaseModel):
    asr_model_name: AsrModelName = DEFAULT_ASR_MODEL_NAME
    chunk_size: list[int] = Field(default_factory=lambda: [5, 10, 5])
    wav_name: str = "h5"
    is_speaking: bool = True
    wav_format: str = "pcm"
    chunk_interval: int = 10
    itn: bool = True
    mode: str = "2pass"
    hotwords: str = ""
    remote_url: str = "ws://116.136.189.9:10095"


class AsrStreamInit(BaseModel):
    postprocess: PostProcessParams
    asr_config: Asr2PassConfig = Field(default_factory=Asr2PassConfig)


class LLMTestResponse(BaseModel):
    status: str
    latency_ms: int
    message: str


class ShapeTokensUsed(BaseModel):
    prompt: int
    completion: int
    total: int


class ShapeResponse(BaseModel):
    status: str
    original_length: int
    processed_length: int
    result_text: str
    tokens_used: ShapeTokensUsed
    latency_ms: int


class AsrFileAsrResponse(BaseModel):
    status: str = "success"
    wav_name: str
    asr_text: str
    raw_offline: dict[str, Any] = Field(default_factory=dict)


class AsrFileShapeResponse(BaseModel):
    status: str = "success"
    wav_name: str
    asr_text: str
    raw_offline: dict[str, Any] = Field(default_factory=dict)
    shape: ShapeResponse


class ErrorResponse(BaseModel):
    status: str = "error"
    message: str
    detail: Optional[str] = None


def _pydantic_model_to_dict(model: BaseModel) -> dict[str, Any]:
    """
    Small helper for response building; keeps response code concise.
    """
    return model.model_dump()

