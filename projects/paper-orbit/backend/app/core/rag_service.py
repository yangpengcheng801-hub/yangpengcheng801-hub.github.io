"""检索增强生成（RAG）论文问答服务。"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING, Any

from app.config import get_settings
from app.core.hybrid_retrieval import hybrid_search
from app.core.paper_chunks import chapter_chunks_for_query, load_paper_chunks, merge_retrieved_chunks
from app.core.vector_store import get_vector_store
from app.schemas.models import ChatMessage, SourceItem

if TYPE_CHECKING:
    from langchain_core.messages import BaseMessage
    from langchain_openai import ChatOpenAI


RAG_SYSTEM_PROMPT = """你是论文问答助手，必须遵守以下规则：
1. 只能基于给定的论文原文片段回答，禁止用常识补充或猜测；
2. 关键信息在正文中自然标注来源，格式为 [章节｜位置]；
3. 当用户询问某一章节（如引言、结论、某节）讲了什么时，只要证据中有该章正文，
   就必须据实概括，不得回答「未提供」「无法回答」「证据不足」；
4. 仅当证据确实与该问题无关时，才简短说明原文未涉及；
5. 当用户询问“核心创新点”“创新”“贡献”时，应归纳原文中的方法、架构、技术路线、
   部署模式、实验结论等实质性贡献，即使原文未出现“创新”二字也要据实总结；
6. 禁止在回答末尾追加免责声明，例如「需注意」「以上总结严格依据」「未引入外部知识」
   「原文未提及，现有证据不足：……」等套话；直接给出正文即可。
回答应准确、简洁。"""


def _is_disclaimer_paragraph(paragraph: str) -> bool:
    """识别模型常见的免责声明段落。"""

    text = paragraph.strip()
    if not text:
        return True
    if re.fullmatch(r"原文未提及[，,]现有证据不足[。.]?", text):
        return False
    if text.startswith(("需注意", "注意：", "注意:", "以上总结", "特别说明")):
        return True
    if text.startswith(("原文未提及", "原文未提到")) and re.search(r"[：:]", text):
        return True
    if "未引入外部知识" in text or "严格依据所提供片段" in text or "严格依据给定" in text:
        return True
    if "因原文未提供而无法归纳" in text or "因原文未提及而无法" in text:
        return True
    return False


def _clean_answer(text: str) -> str:
    """去掉回答末尾的免责声明套话。"""

    paragraphs = [part.strip() for part in re.split(r"\n\s*\n", text.strip()) if part.strip()]
    if not paragraphs:
        return text.strip()
    filtered = [part for part in paragraphs if not _is_disclaimer_paragraph(part)]
    return "\n\n".join(filtered).strip() if filtered else paragraphs[0].strip()


def _create_llm() -> ChatOpenAI:
    """创建用于 RAG 回答的 OpenAI 兼容客户端。"""

    from langchain_openai import ChatOpenAI

    settings = get_settings()
    if not settings.llm_api_key:
        raise RuntimeError("未配置 LLM_API_KEY，无法执行论文问答。")
    return ChatOpenAI(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model_name,
        temperature=settings.llm_temperature,
        timeout=settings.llm_timeout,
        max_retries=2,
    )


def _history_messages(history: list[ChatMessage | dict[str, str]] | None) -> list[BaseMessage]:
    """把最多 10 轮历史转换为 LangChain 消息。"""

    from langchain_core.messages import AIMessage, HumanMessage

    messages: list[BaseMessage] = []
    for item in (history or [])[-20:]:
        parsed = item if isinstance(item, ChatMessage) else ChatMessage.model_validate(item)
        messages.append(HumanMessage(content=parsed.content) if parsed.role == "user" else AIMessage(content=parsed.content))
    return messages


def _content_text(content: Any) -> str:
    """将模型响应内容安全转换为字符串。"""

    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(str(part.get("text", "")) if isinstance(part, dict) else str(part) for part in content)
    return str(content)


def _retrieve_chunks(paper_id: str, query: str, top_k: int) -> list:
    """混合检索论文证据块。"""

    store = get_vector_store()
    return hybrid_search(store.search, paper_id, query, top_k=top_k)


def _build_messages(query: str, history, chunks) -> list:
    from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage

    context = "\n\n".join(
        f"[{chunk.chapter_path}｜{chunk.position}]\n{chunk.content}"
        for chunk in chunks
    )
    messages: list[BaseMessage] = [SystemMessage(content=RAG_SYSTEM_PROMPT)]
    messages.extend(_history_messages(history))
    messages.append(HumanMessage(content=f"论文证据：\n{context}\n\n当前问题：{query}"))
    return messages


def chat(
    paper_id: str,
    query: str,
    history: list[ChatMessage | dict[str, str]] | None = None,
    top_k: int = 4,
) -> dict[str, Any]:
    """检索相关论文片段，结合多轮上下文生成带来源的回答。"""

    chunks = _retrieve_chunks(paper_id, query, top_k)
    if not chunks:
        return {"answer": "原文未提及，现有证据不足。", "sources": []}

    response = _create_llm().invoke(_build_messages(query, history, chunks))
    sources = [SourceItem(**chunk.model_dump()).model_dump() for chunk in chunks]
    return {"answer": _clean_answer(_content_text(response.content)), "sources": sources}


def chat_stream(
    paper_id: str,
    query: str,
    history: list[ChatMessage | dict[str, str]] | None = None,
    top_k: int = 4,
):
    """流式生成论文问答。"""

    chunks = _retrieve_chunks(paper_id, query, top_k)
    if not chunks:
        yield "原文未提及，现有证据不足。"
        return
    for chunk in _create_llm().stream(_build_messages(query, history, chunks)):
        text = _content_text(chunk.content)
        if text:
            yield text
