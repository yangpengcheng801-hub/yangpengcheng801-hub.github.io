"""基于 ChromaDB 与 sentence-transformers 的本地向量存储。"""

from __future__ import annotations

import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from app.config import get_settings
from app.schemas.models import DocumentChunk


class VectorStore:
    """论文文本块的持久化向量索引与混合检索服务。"""

    def __init__(self) -> None:
        # 重型依赖延迟到首次上传/检索时加载，避免 FastAPI 启动被
        # sentence-transformers 及其深度学习后端阻塞数十秒。
        # BGE 使用 PyTorch 推理，无需让 Transformers 探测并加载 TensorFlow。
        os.environ.setdefault("USE_TF", "0")
        os.environ.setdefault("USE_TORCH", "1")
        os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
        os.environ.setdefault("HF_HUB_OFFLINE", "1")
        os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
        import chromadb
        from chromadb.config import Settings as ChromaSettings
        from sentence_transformers import SentenceTransformer

        settings = get_settings()
        model_path = settings.embedding_model_name
        if Path(model_path).is_absolute():
            if not Path(model_path).is_dir():
                raise RuntimeError(
                    f"本地向量模型不存在：{model_path}。"
                    "请确认 backend/models/bge-small-zh-v1.5 已完整复制。"
                )
        self._model = SentenceTransformer(
            model_path,
            device=settings.embedding_device,
            local_files_only=True,
        )
        self._client = chromadb.PersistentClient(
            path=str(settings.vector_db_path),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        self._collection: Any = self._client.get_or_create_collection(
            name="paper_chunks",
            metadata={"hnsw:space": "cosine"},
        )

    def _encode(self, texts: list[str]) -> list[list[float]]:
        """批量生成归一化嵌入，并转换为 Chroma 可序列化列表。"""

        vectors = self._model.encode(
            texts,
            normalize_embeddings=True,
            show_progress_bar=False,
        )
        return vectors.tolist()

    def add_document(self, paper_id: str, chunks: list[DocumentChunk]) -> None:
        """向量化论文块并写入本地 ChromaDB；重复上传时使用 upsert。"""

        if not chunks:
            raise ValueError("待入库的文档块不能为空。")
        documents = [f"章节：{chunk.chapter_path}\n{chunk.content}" for chunk in chunks]
        metadatas: list[dict[str, Any]] = []
        ids: list[str] = []
        for chunk in chunks:
            metadata: dict[str, Any] = {
                "paper_id": paper_id,
                "chunk_id": chunk.chunk_id,
                "chapter_path": chunk.chapter_path,
                "content_type": str(chunk.content_type),
                "position": chunk.position,
            }
            if chunk.page_num is not None:
                metadata["page_num"] = chunk.page_num
            metadatas.append(metadata)
            ids.append(f"{paper_id}:{chunk.chunk_id}")

        # 分批写入可避免超长论文一次请求过大。
        batch_size = 128
        embeddings = self._encode(documents)
        for start in range(0, len(chunks), batch_size):
            end = start + batch_size
            self._collection.upsert(
                ids=ids[start:end],
                documents=documents[start:end],
                embeddings=embeddings[start:end],
                metadatas=metadatas[start:end],
            )

    @staticmethod
    def _query_tokens(query: str) -> set[str]:
        """提取中英文查询词，避免整句中文无法命中章节标题。"""

        lowered = query.lower()
        tokens = set(re.findall(r"[a-z0-9_]+", lowered))
        for segment in re.findall(r"[\u4e00-\u9fff]+", query):
            if 2 <= len(segment) <= 8:
                tokens.add(segment)
            for size in (2, 3, 4):
                for index in range(len(segment) - size + 1):
                    tokens.add(segment[index:index + size])
        for keyword in (
            "引言", "绪论", "摘要", "结论", "结束语", "参考文献",
            "创新", "方法", "实验", "展望", "背景", "摘要",
        ):
            if keyword in query:
                tokens.add(keyword)
        return tokens

    @staticmethod
    def _title_score(query: str, chapter_path: str) -> float:
        """计算查询与章节标题的轻量词项重合加权分。"""

        query_tokens = VectorStore._query_tokens(query)
        title = chapter_path.lower()
        leaf = chapter_path.split("/")[-1].lower()
        score = 0.0
        for token in query_tokens:
            if len(token) < 2:
                continue
            if token in leaf:
                score += 1.2
            elif token in title:
                score += 0.8
        return score

    def delete_document(self, paper_id: str) -> None:
        """删除指定论文的全部向量记录。"""

        self._collection.delete(where={"paper_id": paper_id})

    def search(self, paper_id: str, query: str, top_k: int = 4) -> list[DocumentChunk]:
        """执行语义召回 + 章节标题加权的混合检索。"""

        if not query.strip():
            raise ValueError("检索问题不能为空。")
        total = self._collection.count()
        if total == 0:
            return []
        candidate_count = min(max(top_k * 3, top_k), total)
        result = self._collection.query(
            query_embeddings=self._encode([query]),
            n_results=candidate_count,
            where={"paper_id": paper_id},
            include=["documents", "metadatas", "distances"],
        )
        documents = (result.get("documents") or [[]])[0]
        metadatas = (result.get("metadatas") or [[]])[0]
        distances = (result.get("distances") or [[]])[0]

        ranked: list[tuple[float, DocumentChunk]] = []
        for document, metadata, distance in zip(documents, metadatas, distances, strict=False):
            if not metadata:
                continue
            # Chroma cosine distance 越小越相关；标题命中给予额外加分。
            semantic_score = 1.0 - float(distance)
            chapter = str(metadata.get("chapter_path", "全文"))
            final_score = semantic_score + 0.25 * self._title_score(query, chapter)
            content = str(document).split("\n", 1)[-1]
            chunk = DocumentChunk(
                chunk_id=str(metadata["chunk_id"]),
                chapter_path=chapter,
                content=content,
                content_type=str(metadata.get("content_type", "text")),
                position=str(metadata.get("position", "未知位置")),
                page_num=int(metadata["page_num"]) if "page_num" in metadata else None,
            )
            ranked.append((final_score, chunk))
        ranked.sort(key=lambda item: item[0], reverse=True)
        return [chunk for _, chunk in ranked[:top_k]]


@lru_cache(maxsize=1)
def get_vector_store() -> VectorStore:
    """惰性创建向量服务，避免应用导入阶段立即下载模型。"""

    return VectorStore()
