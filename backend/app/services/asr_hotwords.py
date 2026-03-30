from __future__ import annotations

import json
from typing import Any


def parse_hotwords_json(hotwords: str) -> dict[str, int]:
    raw = (hotwords or "").strip()
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(obj, dict):
        return {}
    out: dict[str, int] = {}
    for k, v in obj.items():
        key = str(k).strip()
        if not key:
            continue
        try:
            out[key] = int(v)
        except (TypeError, ValueError):
            continue
    return out


def build_hotwords_from_lexicon(lexicon: list[str], *, default_weight: int = 30) -> dict[str, int]:
    out: dict[str, int] = {}
    for item in lexicon:
        key = str(item).strip()
        if not key:
            continue
        out[key] = int(default_weight)
    return out


def merge_hotwords(explicit_hotwords: dict[str, int], lexicon_hotwords: dict[str, int]) -> dict[str, int]:
    merged = dict(explicit_hotwords)
    for k, v in lexicon_hotwords.items():
        if k not in merged:
            merged[k] = v
    return merged


def merge_hotwords_json_with_lexicon(hotwords_json: str, lexicon: list[str]) -> str:
    explicit_hotwords = parse_hotwords_json(hotwords_json)
    lexicon_hotwords = build_hotwords_from_lexicon(lexicon)
    merged = merge_hotwords(explicit_hotwords, lexicon_hotwords)
    return json.dumps(merged, ensure_ascii=False)


def parse_lexicon_json(raw: str) -> list[str]:
    obj: Any = json.loads(raw)
    if not isinstance(obj, list):
        raise ValueError("lexicon 必须是 JSON 数组")
    out: list[str] = []
    for item in obj:
        if not isinstance(item, str):
            raise ValueError("lexicon 数组元素必须是字符串")
        val = item.strip()
        if val:
            out.append(val)
    return out

