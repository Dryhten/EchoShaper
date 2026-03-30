from __future__ import annotations

import re


_TRAILING_PERIOD_RE = re.compile(r"[。\.]+\s*$")


def strip_trailing_period(text: str) -> str:
    """
    仅移除“末尾”的中文句号“。”或英文句号“.”，不影响中间标点。
    """
    if not text:
        return text
    return _TRAILING_PERIOD_RE.sub("", text).strip()

