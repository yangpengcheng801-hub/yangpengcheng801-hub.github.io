"""论文上传、结构、知识萃取与 RAG 问答 RESTful 接口。"""

from __future__ import annotations

import json
import re
import uuid
from pathlib import Path
from typing import Any, NoReturn

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.config import PROJECT_ROOT, get_settings
from app.core.knowledge_extractor import extract_knowledge, paper_input_chars
from app.core.rag_service import _clean_answer, chat, chat_stream
from app.core.vector_store import get_vector_store
from app.parsers import parse_pdf, parse_word
from app.schemas.models import (
    ChapterOutline,
    ChatRequest,
    ChatResponse,
    ContentType,
    DocumentChunk,
    KnowledgeResponse,
    PaperKnowledge,
    PaperSummary,
    UploadResponse,
)


router = APIRouter(prefix="/api", tags=["paper"])
settings = get_settings()
PAPER_ID_PATTERN = re.compile(r"^[a-f0-9]{32}$")


def _raise(status_code: int, code: str, message: str) -> NoReturn:
    """抛出包含统一业务错误码的 HTTP 异常。"""

    raise HTTPException(status_code=status_code, detail={"code": code, "message": message})


def _validate_paper_id(paper_id: str) -> None:
    """校验论文 ID，阻止路径穿越与非法标识。"""

    if not PAPER_ID_PATTERN.fullmatch(paper_id):
        _raise(400, "INVALID_PAPER_ID", "paper_id 格式不正确。")


def _record_path(paper_id: str) -> Path:
    """返回论文解析记录路径。"""

    _validate_paper_id(paper_id)
    return settings.paper_data_dir / f"{paper_id}.json"


def _knowledge_path(paper_id: str) -> Path:
    """返回论文知识缓存路径。"""

    _validate_paper_id(paper_id)
    return settings.paper_data_dir / f"{paper_id}.knowledge.json"


def _portable_file_path(path: Path) -> str:
    """将项目内文件保存为相对路径，复制项目目录后仍可访问。"""

    resolved = path.resolve()
    try:
        return resolved.relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        # 自定义上传目录位于项目外时保留绝对路径，避免破坏用户配置。
        return str(resolved)


def _record_file_path(record: dict[str, Any]) -> Path:
    """解析论文记录中的路径，并兼容旧版本保存的绝对路径。"""

    raw_path = str(record.get("file_path", "")).strip()
    if not raw_path:
        return Path()
    stored = Path(raw_path)
    if stored.is_absolute():
        if stored.is_file():
            return stored
        # 项目移动后，旧绝对路径失效时按文件名回退到当前上传目录。
        fallback = settings.upload_dir / stored.name
        return fallback if fallback.is_file() else stored

    candidate = (PROJECT_ROOT / stored).resolve()
    try:
        candidate.relative_to(PROJECT_ROOT.resolve())
    except ValueError:
        _raise(500, "PAPER_DATA_CORRUPTED", "论文文件路径超出项目目录。")
    return candidate


def _load_record(paper_id: str) -> dict[str, Any]:
    """加载论文完整记录。"""

    path = _record_path(paper_id)
    if not path.exists():
        _raise(404, "PAPER_NOT_FOUND", "论文不存在或尚未上传。")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        _raise(500, "PAPER_DATA_CORRUPTED", f"论文记录读取失败：{exc}")


def _load_chunks(paper_id: str) -> list[DocumentChunk]:
    """从本地 JSON 记录加载论文文本块。"""

    payload = _load_record(paper_id)
    try:
        return [DocumentChunk.model_validate(item) for item in payload["chunks"]]
    except (KeyError, ValueError) as exc:
        _raise(500, "PAPER_DATA_CORRUPTED", f"论文记录读取失败：{exc}")


def _structure_order(path: str) -> tuple[int, tuple[int, ...], int, str]:
    """章节路径排序键：标题类优先，再按编号层级，最后按深度。"""

    leaf = path.split("/")[-1]
    depth = path.count("/")
    number = re.match(r"^(\d+(?:\.\d+)*)\s", leaf)
    if number:
        return 1, tuple(int(part) for part in number.group(1).split(".")), depth, path
    if re.search(r"参考文献|references|作者简介", leaf, re.I):
        return 4, (), depth, path
    if re.search(r"摘要|abstract|引言|绪论", leaf, re.I):
        return 0, (), depth, path
    if "论文" in leaf or "研究" in leaf:
        return 0, (), depth, path
    return 2, (), depth, path


def _should_skip_outline_path(path: str) -> bool:
    """目录树中不展示作者简介等非正文章节。"""

    leaf = path.split("/")[-1].strip()
    return bool(re.fullmatch(r"作者简介", leaf, re.I) or re.fullmatch(r"about the authors?", leaf, re.I))


def _structure(chunks: list[DocumentChunk]) -> list[str]:
    """生成去重后的章节路径，并按论文编号自然排序。"""

    seen: set[str] = set()
    result: list[str] = []
    for chunk in chunks:
        if chunk.chapter_path not in seen:
            seen.add(chunk.chapter_path)
            result.append(chunk.chapter_path)
    return sorted(
        [path for path in result if not _should_skip_outline_path(path)],
        key=_structure_order,
    )


def _outline(chunks: list[DocumentChunk]) -> list[ChapterOutline]:
    """为每个章节生成目录锚点，优先定位章节标题。"""

    anchors: dict[str, DocumentChunk] = {}
    for chunk in chunks:
        existing = anchors.get(chunk.chapter_path)
        if existing is None:
            anchors[chunk.chapter_path] = chunk
            continue
        if chunk.content_type == ContentType.TITLE and existing.content_type != ContentType.TITLE:
            anchors[chunk.chapter_path] = chunk
    return [
        ChapterOutline(
            path=path,
            title=path.split("/")[-1],
            chunk_id=anchors[path].chunk_id,
            page_num=anchors[path].page_num,
        )
        for path in _structure(chunks)
        if path in anchors
    ]


def _knowledge_meta(chunks: list[DocumentChunk]) -> tuple[bool, int]:
    """计算知识萃取是否发生截断。"""

    total = paper_input_chars(chunks)
    return total > settings.llm_max_input_chars, total



@router.get("/papers", response_model=list[PaperSummary])
async def list_papers() -> list[PaperSummary]:
    """列出本地已上传论文。"""

    summaries: list[PaperSummary] = []
    for path in settings.paper_data_dir.glob("*.json"):
        if path.name.endswith(".knowledge.json"):
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            summaries.append(PaperSummary(
                paper_id=str(payload["paper_id"]),
                filename=str(payload["filename"]),
                chunk_count=len(payload.get("chunks", [])),
            ))
        except (OSError, KeyError, json.JSONDecodeError, TypeError):
            continue
    return sorted(summaries, key=lambda item: item.paper_id, reverse=True)


@router.post("/upload", response_model=UploadResponse, status_code=201)
async def upload_paper(file: UploadFile = File(...)) -> UploadResponse:
    """上传 PDF/DOCX，完成解析、持久化和向量索引。"""

    filename = Path(file.filename or "").name
    suffix = Path(filename).suffix.lower()
    if suffix not in {".pdf", ".docx"}:
        _raise(415, "UNSUPPORTED_FILE_TYPE", "仅支持 .pdf 和 .docx 文件。")

    max_bytes = settings.max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    await file.close()
    if not content:
        _raise(400, "EMPTY_FILE", "上传文件为空。")
    if len(content) > max_bytes:
        _raise(413, "FILE_TOO_LARGE", f"文件不能超过 {settings.max_upload_mb} MB。")

    paper_id = uuid.uuid4().hex
    saved_path = settings.upload_dir / f"{paper_id}{suffix}"
    saved_path.write_bytes(content)
    try:
        parser = parse_pdf if suffix == ".pdf" else parse_word
        chunks = await run_in_threadpool(parser, str(saved_path))
        await run_in_threadpool(get_vector_store().add_document, paper_id, chunks)
        structure = _structure(chunks)
        record = {
            "paper_id": paper_id,
            "filename": filename,
            "file_path": _portable_file_path(saved_path),
            "structure": structure,
            "chunks": [chunk.model_dump(mode="json") for chunk in chunks],
        }
        _record_path(paper_id).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
    except HTTPException:
        raise
    except ValueError as exc:
        saved_path.unlink(missing_ok=True)
        message = str(exc)
        if "OCR" in message or "未提取到可用文本" in message:
            _raise(422, "SCANNED_PDF_UNSUPPORTED", message)
        _raise(422, "PAPER_PARSE_FAILED", message)
    except Exception as exc:
        saved_path.unlink(missing_ok=True)
        _raise(500, "PAPER_PROCESSING_FAILED", f"论文解析或向量化失败：{exc}")

    return UploadResponse(
        paper_id=paper_id,
        filename=filename,
        chunk_count=len(chunks),
        structure=structure,
        outline=_outline(chunks),
    )


@router.get("/paper/{paper_id}/structure", response_model=list[str])
async def get_structure(paper_id: str) -> list[str]:
    """获取论文完整章节结构。"""

    return _structure(_load_chunks(paper_id))


@router.get("/paper/{paper_id}/outline", response_model=list[ChapterOutline])
async def get_outline(paper_id: str) -> list[ChapterOutline]:
    """获取带页码的章节目录，用于前端跳转定位。"""

    return _outline(_load_chunks(paper_id))


@router.get("/paper/{paper_id}/file")
async def get_paper_file(paper_id: str) -> FileResponse:
    """下载论文原始文件，用于刷新后恢复预览。"""

    record = _load_record(paper_id)
    file_path = _record_file_path(record)
    if not file_path.is_file():
        _raise(404, "PAPER_FILE_NOT_FOUND", "论文原文件不存在。")
    return FileResponse(file_path, filename=str(record["filename"]))


@router.get("/paper/{paper_id}/knowledge", response_model=KnowledgeResponse)
async def get_knowledge(paper_id: str) -> KnowledgeResponse:
    """获取核心知识；首次请求调用大模型，后续读取本地缓存。"""

    chunks = _load_chunks(paper_id)
    truncated, input_chars = _knowledge_meta(chunks)
    cache = _knowledge_path(paper_id)
    if cache.exists():
        try:
            payload = json.loads(cache.read_text(encoding="utf-8"))
            if "knowledge" in payload:
                return KnowledgeResponse(
                    knowledge=PaperKnowledge.model_validate(payload["knowledge"]),
                    truncated=bool(payload.get("truncated", truncated)),
                    input_chars=int(payload.get("input_chars", input_chars)),
                )
            knowledge = PaperKnowledge.model_validate(payload)
            return KnowledgeResponse(knowledge=knowledge, truncated=truncated, input_chars=input_chars)
        except (OSError, ValueError, KeyError):
            cache.unlink(missing_ok=True)

    try:
        knowledge = await run_in_threadpool(extract_knowledge, chunks)
        cache_payload = {
            "knowledge": knowledge.model_dump(mode="json"),
            "truncated": truncated,
            "input_chars": input_chars,
        }
        cache.write_text(json.dumps(cache_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        return KnowledgeResponse(knowledge=knowledge, truncated=truncated, input_chars=input_chars)
    except RuntimeError as exc:
        _raise(503, "LLM_NOT_CONFIGURED", str(exc))
    except Exception as exc:
        _raise(502, "KNOWLEDGE_EXTRACTION_FAILED", f"知识萃取失败：{exc}")


@router.post("/paper/{paper_id}/chat", response_model=ChatResponse)
async def paper_chat(paper_id: str, request: ChatRequest) -> ChatResponse:
    """对指定论文执行带来源证据的多轮 RAG 问答。"""

    _load_chunks(paper_id)
    try:
        result = await run_in_threadpool(
            chat,
            paper_id,
            request.query,
            request.history,
            request.top_k,
        )
        return ChatResponse.model_validate(result)
    except RuntimeError as exc:
        _raise(503, "LLM_NOT_CONFIGURED", str(exc))
    except Exception as exc:
        _raise(502, "RAG_CHAT_FAILED", f"论文问答失败：{exc}")


@router.post("/paper/{paper_id}/chat/stream")
async def paper_chat_stream(paper_id: str, request: ChatRequest) -> StreamingResponse:
    """流式 RAG 问答，返回 text/event-stream。"""

    _load_chunks(paper_id)

    def event_stream():
        buffer: list[str] = []
        try:
            for token in chat_stream(paper_id, request.query, request.history, request.top_k):
                buffer.append(token)
                yield f"data: {json.dumps({'token': token}, ensure_ascii=False)}\n\n"
            answer = _clean_answer("".join(buffer))
            yield f"data: {json.dumps({'done': True, 'answer': answer}, ensure_ascii=False)}\n\n"
        except RuntimeError as exc:
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'error': f'论文问答失败：{exc}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/paper/{paper_id}/chunk/{chunk_id}", response_model=DocumentChunk)
async def get_chunk(paper_id: str, chunk_id: str) -> DocumentChunk:
    """根据块 ID 获取可追溯的原文详情。"""

    for chunk in _load_chunks(paper_id):
        if chunk.chunk_id == chunk_id:
            return chunk
    _raise(404, "CHUNK_NOT_FOUND", "指定原文块不存在。")


@router.delete("/paper/{paper_id}")
async def delete_paper(paper_id: str) -> dict[str, bool]:
    """删除论文记录、原文件、知识缓存与向量索引。"""

    _validate_paper_id(paper_id)
    record_path = _record_path(paper_id)
    if not record_path.exists():
        _raise(404, "PAPER_NOT_FOUND", "论文不存在或尚未上传。")

    try:
        record = json.loads(record_path.read_text(encoding="utf-8"))
        file_path = _record_file_path(record)
        if file_path.is_file():
            file_path.unlink()
    except (OSError, json.JSONDecodeError):
        pass

    record_path.unlink(missing_ok=True)
    _knowledge_path(paper_id).unlink(missing_ok=True)
    await run_in_threadpool(get_vector_store().delete_document, paper_id)
    return {"ok": True}
