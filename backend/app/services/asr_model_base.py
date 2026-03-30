from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Generic, TypeVar

from pydantic import BaseModel

from app.models.asr_adapter_schemas import AsrModelInput, AsrModelOutput, AudioData

TInput = TypeVar("TInput", bound=AsrModelInput)
TOutput = TypeVar("TOutput", bound=AsrModelOutput)


class BaseAsrModel(ABC, Generic[TInput, TOutput]):
    @property
    @abstractmethod
    def model_name(self) -> str:
        raise NotImplementedError

    async def run(self, audio: AudioData, model_input: TInput, output_model: type[TOutput]) -> TOutput:
        normalized_audio = await self.preprocess_audio(audio, model_input)
        raw = await self.call_model(normalized_audio, model_input)
        parsed = self.parse_output(raw, output_model)
        return await self.postprocess_output(parsed, model_input)

    async def preprocess_audio(self, audio: AudioData, model_input: TInput) -> AudioData:
        return audio

    @abstractmethod
    async def call_model(self, audio: AudioData, model_input: TInput) -> dict[str, Any]:
        raise NotImplementedError

    def parse_output(self, raw_output: dict[str, Any], output_model: type[TOutput]) -> TOutput:
        return output_model.model_validate(raw_output)

    async def postprocess_output(self, output: TOutput, model_input: TInput) -> TOutput:
        return output

    def stream_remote_url(self, model_input: TInput) -> str:
        raise NotImplementedError(f"{self.model_name} does not support streaming.")

    def build_stream_init_payload(self, model_input: TInput, *, session_id: str) -> dict[str, Any]:
        raise NotImplementedError(f"{self.model_name} does not support streaming.")

    def parse_stream_message(self, data: dict[str, Any]) -> tuple[str, Any]:
        return "message", data

