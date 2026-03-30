from __future__ import annotations

from typing import Mapping

from app.models.schemas import PresetSkill, ProcessRequest


SYSTEM_ROLE = "你是一个专业的语音转写(ASR)后处理引擎。请严格按照以下规则处理用户的原始语音文本：\n\n"


def build_system_prompt(request: ProcessRequest, preset_skills: Mapping[str, PresetSkill]) -> str:
    prompt = SYSTEM_ROLE

    # 1. 个人词库纠错（最高优先级）
    if request.lexicon:
        prompt += (
            "【个人词库纠错】：请参考下面的个人词库词条，在不破坏语义的前提下，"
            "把原始文本中疑似由 ASR 误识别产生的相似片段替换成最匹配的词库词条。\n"
            f"词库：{', '.join(request.lexicon)}。\n"
            "替换规则：仅当你确信它们指向同一个词/短语时才替换；"
            "如果疑似片段前后夹带语气词或分隔符（例如“啊”“呃”“嗯”及其后面的逗号/顿号），"
            "在判断是否对应词库词条时可以忽略这些填充/分隔符；"
            "若确认对应，则仍需替换为词库词条；并且若替换点前紧跟的是这些语气词（如“啊，景观...”），"
            "请把该语气词一并去掉，避免输出中多余的“啊”。"
            "如果文本中已经正确出现词库词条，则保持其原样不改变拼写。\n\n"
        )

    # 2. 全局偏好
    if request.personal_preference:
        prompt += f"【全局偏好】：{request.personal_preference}\n\n"

    # 3. 技能指令注入
    prompt += "【执行动作列表】（请依次执行）：\n"

    for preset_id in request.preset_skills:
        preset = preset_skills.get(preset_id)
        if preset:
            prompt += f"- {preset.instruction}\n"

    for skill in request.custom_skills:
        prompt += f"- [{skill.name}]: {skill.instruction}\n"

    prompt += "\n请直接输出处理后的最终结果，不要包含任何解释性废话。"
    return prompt


def build_user_message(raw_text: str) -> str:
    return f"需要处理的ASR文本如下：\n\n{raw_text}"


def build_messages(request: ProcessRequest, preset_skills: Mapping[str, PresetSkill]) -> list[dict[str, str]]:
    system_prompt = build_system_prompt(request, preset_skills)
    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": build_user_message(request.raw_text)},
    ]

