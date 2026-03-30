from __future__ import annotations

from typing import Any

from openai import AsyncOpenAI


def create_llm_client(base_url: str, api_key: str) -> AsyncOpenAI:
    return AsyncOpenAI(base_url=base_url, api_key=api_key)


async def chat_completion(
    client: AsyncOpenAI,
    model: str,
    messages: list[dict[str, Any]],
    *,
    temperature: float = 0.2,
) -> dict[str, Any]:
    completion = await client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return completion.model_dump()

