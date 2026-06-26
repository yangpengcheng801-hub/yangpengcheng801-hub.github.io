"""论文原文块加载与章节意图检索。"""

from __future__ import annotations

import json
import re
from functools import lru_cache

from app.config import get_settings
from app.schemas.models import ContentType, DocumentChunk

PAPER_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")

SECTION_QUERY_RULES: list[tuple[re.Pattern[str], list[str]]] = [
    (re.compile(r"引言|绪论"), ["引言", "绪论"]),
    (re.compile(r"结束语|结论"), ["结束语", "结论"]),
    (re.compile(r"摘要|abstract", re.I), ["摘要", "abstract"]),
    (re.compile(r"参考文献|references", re.I), ["参考文献", "references"]),
    (re.compile(r"建议与展望"), ["建议与展望"]),
    (re.compile(r"作者简介|about the authors?", re.I), ["作者简介"]),
]


def load_paper_chunks(paper_id: str) -> list[DocumentChunk]:
    """从本地 JSON 记录加载论文全部文本块。"""

    if not PAPER_ID_PATTERN.fullmatch(paper_id):
        raise ValueError("paper_id 格式不正确。")
    path = get_settings().paper_data_dir / f"{paper_id}.json"
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [DocumentChunk.model_validate(item) for item in payload.get("chunks", [])]


def section_keywords_for_query(query: str) -> list[str]:
    """从用户问题中识别章节关键词。"""

    keywords: list[str] = []
    for pattern, aliases in SECTION_QUERY_RULES:
        if pattern.search(query):
            keywords.extend(aliases)
    numbered = re.search(r"(\d+(?:\.\d+){0,2})\s*(?:节|章|部分)?", query)
    if numbered:
        keywords.append(numbered.group(1))
    deduped: list[str] = []
    for keyword in keywords:
        if keyword not in deduped:
            deduped.append(keyword)
    return deduped


def chapter_chunks_for_query(chunks: list[DocumentChunk], query: str, limit: int = 4) -> list[DocumentChunk]:
    """按章节意图召回正文块，优先返回非标题内容。"""

    keywords = section_keywords_for_query(query)
    if not keywords:
        return []

    matched: list[DocumentChunk] = []
    for chunk in chunks:
        leaf = chunk.chapter_path.split("/")[-1]
        if not any(keyword.lower() in leaf.lower() or keyword.lower() in chunk.chapter_path.lower() for keyword in keywords):
            continue
        if chunk.content_type == ContentType.TITLE and chunk.content.strip() == leaf.strip():
            continue
        matched.append(chunk)

    if not matched:
        for chunk in chunks:
            leaf = chunk.chapter_path.split("/")[-1]
            if any(keyword.lower() in leaf.lower() for keyword in keywords):
                matched.append(chunk)

    return matched[:limit]


def merge_retrieved_chunks(primary: list[DocumentChunk], supplemental: list[DocumentChunk], top_k: int) -> list[DocumentChunk]:
    """合并向量检索与章节检索结果，章节命中优先。"""

    merged: list[DocumentChunk] = []
    seen: set[str] = set()
    for chunk in supplemental + primary:
        if chunk.chunk_id in seen:
            continue
        seen.add(chunk.chunk_id)
        merged.append(chunk)
        if len(merged) >= top_k:
            break
    return merged
