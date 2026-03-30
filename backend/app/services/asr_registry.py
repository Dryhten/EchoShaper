from __future__ import annotations

from app.services.asr_2pass_model import TwoPassWsAsrModel
from app.services.asr_model_base import BaseAsrModel


_ASR_MODELS: dict[str, BaseAsrModel] = {
    "two_pass_ws": TwoPassWsAsrModel(),
}


def get_asr_model(asr_model_name: str) -> BaseAsrModel:
    return _ASR_MODELS.get(asr_model_name, _ASR_MODELS["two_pass_ws"])

