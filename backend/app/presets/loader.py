from __future__ import annotations

from pathlib import Path

import yaml

from app.models.schemas import PresetSkill


def load_preset_skills(yaml_path: Path) -> dict[str, PresetSkill]:
    data = yaml.safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    presets: dict[str, PresetSkill] = {}
    for preset_id, payload in data.items():
        if not isinstance(payload, dict):
            continue
        presets[str(preset_id)] = PresetSkill(
            description=str(payload.get("description") or ""),
            instruction=str(payload.get("instruction") or ""),
        )
    return presets

