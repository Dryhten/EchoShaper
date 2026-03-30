from __future__ import annotations

from app.models.schemas import CustomSkill, LLMConfig, PresetSkill, ProcessRequest
from app.prompt_builder import build_system_prompt
from app.utils.text import strip_trailing_period


def test_strip_trailing_period() -> None:
    assert strip_trailing_period("你好。") == "你好"
    assert strip_trailing_period("你好.") == "你好"
    assert strip_trailing_period("你好...") == "你好"
    assert strip_trailing_period("你好。世界") == "你好。世界"


def test_build_system_prompt_basic() -> None:
    llm_config = LLMConfig(model_name="glm-4", base_url="https://example.com/v1", api_key="k")
    request = ProcessRequest(
        raw_text="原始文本",
        llm_config=llm_config,
        preset_skills=["auto_structure"],
        custom_skills=[CustomSkill(name="tone", description="语气", instruction="转商务语气")],
        lexicon=["EchoShaper"],
        personal_preference="尽量简短，不要废话",
    )

    preset_skills = {
        "auto_structure": PresetSkill(
            description="自动结构化",
            instruction="把文本整理为结构化要点与步骤。",
        )
    }

    prompt = build_system_prompt(request, preset_skills)

    assert "个人词库纠错" in prompt
    assert "EchoShaper" in prompt
    assert "全局偏好" in prompt
    assert "尽量简短" in prompt
    assert "忽略这些填充/分隔符" in prompt
    assert "把文本整理为结构化要点与步骤。" in prompt
    assert "- [tone]: 转商务语气" in prompt
    assert "请直接输出处理后的最终结果" in prompt

