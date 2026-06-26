"""BM25 + 向量混合检索与 Cross-Encoder 重排序。"""

from __future__ import annotations

import math
import re
from collections import Counter
from functools import lru_cache
from typing import TYPE_CHECKING

from app.core.paper_chunks import chapter_chunks_for_query, load_paper_chunks, merge_retrieved_chunks
from app.config import get_settings
from app.schemas.models import DocumentChunk

if TYPE_CHECKING:
    from sentence_transformers import CrossEncoder


TOKEN_PATTERN = re.compile(r"[a-z0-9_]+|[\u4e00-\u9fff]")


def _tokenize(text: str) -> list[str]:
    return TOKEN_PATTERN.findall(text.lower())


class _BM25Index:
  """轻量 BM25，避免额外依赖。"""

  def __init__(self, corpus: list[list[str]]) -> None:
    self._corpus = corpus
    self._doc_count = len(corpus)
    self._avg_len = sum(len(doc) for doc in corpus) / max(self._doc_count, 1)
    self._doc_freq: Counter[str] = Counter()
    for doc in corpus:
      self._doc_freq.update(set(doc))
    self._k1 = 1.5
    self._b = 0.75

  def score(self, query_tokens: list[str], doc_index: int) -> float:
    if doc_index >= self._doc_count:
      return 0.0
    doc = self._corpus[doc_index]
    if not doc:
      return 0.0
    doc_len = len(doc)
    term_freq = Counter(doc)
    total = 0.0
    for token in query_tokens:
      if token not in term_freq:
        continue
      df = self._doc_freq.get(token, 0)
      idf = math.log(1 + (self._doc_count - df + 0.5) / (df + 0.5))
      tf = term_freq[token]
      denom = tf + self._k1 * (1 - self._b + self._b * doc_len / max(self._avg_len, 1))
      total += idf * (tf * (self._k1 + 1)) / max(denom, 1e-9)
    return total

  def top_indices(self, query: str, limit: int) -> list[tuple[int, float]]:
    query_tokens = _tokenize(query)
    if not query_tokens:
      return []
    scored = [(index, self.score(query_tokens, index)) for index in range(self._doc_count)]
    scored.sort(key=lambda item: item[1], reverse=True)
    return [item for item in scored[:limit] if item[1] > 0]


def _rrf_merge(
    ranked_lists: list[list[str]],
    top_k: int,
    k: int = 60,
) -> list[str]:
    scores: dict[str, float] = {}
    for ranked in ranked_lists:
      for rank, chunk_id in enumerate(ranked, start=1):
        scores[chunk_id] = scores.get(chunk_id, 0.0) + 1.0 / (k + rank)
    return [chunk_id for chunk_id, _ in sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]]


@lru_cache(maxsize=1)
def _get_reranker() -> CrossEncoder:
    from sentence_transformers import CrossEncoder

    settings = get_settings()
    return CrossEncoder(
      settings.reranker_model_name,
      device="cpu",
      local_files_only=True,
    )


def rerank_chunks(query: str, chunks: list[DocumentChunk], top_k: int) -> list[DocumentChunk]:
    """使用 Cross-Encoder 对候选块重排序。"""

    if len(chunks) <= 1:
      return chunks
    reranker = _get_reranker()
    pairs = [[query, f"{chunk.chapter_path}\n{chunk.content[:700]}"] for chunk in chunks]
    scores = reranker.predict(pairs)
    ranked = sorted(zip(scores, chunks, strict=False), key=lambda item: float(item[0]), reverse=True)
    return [chunk for _, chunk in ranked[:top_k]]


def hybrid_search(
    vector_search,
    paper_id: str,
    query: str,
    top_k: int = 4,
) -> list[DocumentChunk]:
    """向量 + BM25 混合检索，并重排序。"""

    candidate_k = max(top_k * 4, 12)
    vector_chunks = vector_search(paper_id, query, top_k=candidate_k)
    all_chunks = load_paper_chunks(paper_id)
    if not all_chunks:
      return vector_chunks[:top_k]

    chunk_map = {chunk.chunk_id: chunk for chunk in all_chunks}
    corpus = [_tokenize(f"{chunk.chapter_path}\n{chunk.content}") for chunk in all_chunks]
    bm25 = _BM25Index(corpus)
    bm25_hits = bm25.top_indices(query, candidate_k)
    bm25_chunks = [all_chunks[index] for index, _ in bm25_hits]

    section_chunks = chapter_chunks_for_query(all_chunks, query, limit=top_k)
    vector_ids = [chunk.chunk_id for chunk in vector_chunks]
    bm25_ids = [chunk.chunk_id for chunk in bm25_chunks]
    section_ids = [chunk.chunk_id for chunk in section_chunks]
    merged_ids = _rrf_merge([section_ids, vector_ids, bm25_ids], top_k=candidate_k)
    merged = [chunk_map[chunk_id] for chunk_id in merged_ids if chunk_id in chunk_map]
    if section_chunks:
      merged = merge_retrieved_chunks(merged, section_chunks, top_k=len(merged))
    if not merged:
      merged = vector_chunks
    if not get_settings().enable_reranker:
      return merged[:top_k]
    try:
      return rerank_chunks(query, merged[: max(candidate_k, top_k * 2)], top_k=top_k)
    except Exception:
      return merged[:top_k]
