from __future__ import annotations

from typing import Literal

# 预制 ASR 模型名（须与 app.services.asr_registry.PUBLIC_ASR_MODELS 的键一致）
AsrModelName = Literal["funasr"]

DEFAULT_ASR_MODEL_NAME: AsrModelName = "funasr"

ALLOWED_ASR_MODEL_NAMES: frozenset[str] = frozenset({DEFAULT_ASR_MODEL_NAME})
