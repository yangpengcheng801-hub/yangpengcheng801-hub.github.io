"""基于 OpenAI 兼容大模型的论文核心知识萃取引擎。"""

from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any

from app.config import get_settings
from app.schemas.models import DocumentChunk, PaperKnowledge

if TYPE_CHECKING:
    from langchain_openai import ChatOpenAI


def _create_llm() -> ChatOpenAI:
    """构造 OpenAI 兼容客户端，便于通过配置切换模型服务商。"""

    from langchain_openai import ChatOpenAI

    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError("未配置 LLM_API_KEY，无法执行知识萃取。")
    return ChatOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model_name,
        temperature=settings.llm_temperature,
        timeout=settings.llm_timeout,
        max_retries=2,
    )


def _message_text(content: Any) -> str:
    """兼容 LangChain 返回字符串或多段内容列表的情况。"""

    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", "")) if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content)


def _parse_json_response(raw: str) -> PaperKnowledge:
    """从模型响应中提取并校验 PaperKnowledge JSON。"""

    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip(), flags=re.I | re.S)
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("大模型未返回有效 JSON 对象。")
    payload = json.loads(cleaned[start : end + 1])
    return PaperKnowledge.model_validate(payload)


def paper_input_chars(chunks: list[DocumentChunk]) -> int:
    """估算送入知识萃取的论文字符数。"""

    return sum(
        len(f"[{chunk.chapter_path}｜{chunk.position}｜{chunk.content_type}]\n{chunk.content}")
        for chunk in chunks
    )


def extract_knowledge(chunks: list[DocumentChunk]) -> PaperKnowledge:
    """拼接论文全文并调用大模型，返回严格校验的结构化知识。

    MVP 使用非流式调用。为避免超过模型上下文，输入达到配置上限时会截断，
    但保留所有块的位置与章节标签，便于模型理解原文结构。
    """

    from langchain_core.messages import HumanMessage, SystemMessage

    if not chunks:
        raise ValueError("知识萃取至少需要一个文档块。")
    settings = get_settings()
    paper_text = "\n\n".join(
        f"[{chunk.chapter_path}｜{chunk.position}｜{chunk.content_type}]\n{chunk.content}"
        for chunk in chunks
    )
    paper_text = paper_text[: settings.llm_max_input_chars]
    schema = json.dumps(PaperKnowledge.model_json_schema(), ensure_ascii=False)
    user_prompt = f"""请从下列论文原文中萃取核心知识。
必须完整返回这 9 个字段：research_background、core_innovations、method_framework、
key_formulas、datasets、metrics、experiment_conclusion、limitations、application_scenarios。
列表字段必须是 JSON 数组；没有依据时使用空数组或“原文未说明”。

JSON Schema：
{schema}

论文原文：
{paper_text}"""
    response = _create_llm().invoke([
        SystemMessage(content=settings.knowledge_system_prompt),
        HumanMessage(content=user_prompt),
    ])
    return _parse_json_response(_message_text(response.content))
