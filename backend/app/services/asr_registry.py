from __future__ import annotations

from app.models.asr_model_names import ALLOWED_ASR_MODEL_NAMES
from app.services.asr_2pass_model import TwoPassWsAsrModel
from app.services.asr_model_base import BaseAsrModel

_funasr_impl = TwoPassWsAsrModel()

PUBLIC_ASR_MODELS: dict[str, BaseAsrModel] = {
    "funasr": _funasr_impl,
}

assert set(PUBLIC_ASR_MODELS.keys()) == ALLOWED_ASR_MODEL_NAMES, (
    "PUBLIC_ASR_MODELS 与 app.models.asr_model_names.ALLOWED_ASR_MODEL_NAMES 必须一致"
)


def get_asr_model(asr_model_name: str) -> BaseAsrModel:
    try:
        return PUBLIC_ASR_MODELS[asr_model_name]
    except KeyError as e:
        allowed = ", ".join(sorted(PUBLIC_ASR_MODELS.keys()))
        raise ValueError(f"未知的 asr_model_name={asr_model_name!r}，允许值: {allowed}") from e
