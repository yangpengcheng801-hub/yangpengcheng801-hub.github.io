"""使用 pymupdf4llm 将 PDF 解析为统一结构化文本块。"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any

from app.schemas.models import ContentType, DocumentChunk


HEADING_PATTERN = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
FORMULA_PATTERN = re.compile(r"^\s*(?:\$\$.+\$\$|\$.+\$)\s*$", re.DOTALL)
TABLE_LINE_PATTERN = re.compile(r"^\s*\|.*\|\s*$")
SPECIAL_HEADING_PATTERN = re.compile(r"^(摘要|Abstract|引言|绪论|结论|结束语|参考文献|References|作者简介)\s*[:：]?$", re.I)
NUMBERED_HEADING_PATTERN = re.compile(r"^([0-9](?:\s*\.\s*[0-9]){0,2})\s+(.{2,80})$")


def _chunk_id(position: str, content: str) -> str:
    """根据位置和内容生成稳定块 ID。"""

    digest = hashlib.sha1(f"{position}\n{content}".encode("utf-8")).hexdigest()[:16]
    return f"pdf_{digest}"


def _chapter_path(levels: list[str]) -> str:
    """将三级标题栈转换为可读章节路径。"""

    return "/".join(item for item in levels if item) or "全文"


def _normalize_section_number(text: str) -> str:
    """将 PDF 提取的 '3. 1 标题' 规范为 '3.1 标题'。"""

    return re.sub(r"^(\d+(?:\.\d+)*)\.\s+(\d+)\s+", r"\1.\2 ", text.strip())


def _clean_heading(raw: str) -> str:
    """清理 pymupdf4llm 标题中的 Markdown 强调符号。"""

    title = re.sub(r"[*_`]", "", raw)
    title = re.sub(r"\s+", " ", title).strip()
    title = _normalize_section_number(title)
    # 部分论文首页会把论文标题与 Abstract 合并为同一 Markdown 标题，
    # 章节导航应显示 Abstract，而论文原始标题仍可在预览中查看。
    if len(title) > 40 and re.search(r"(?:\bAbstract|摘要)$", title, re.I):
        return "Abstract" if title.lower().endswith("abstract") else "摘要"
    return title


def _plain_heading(line: str) -> tuple[int, str] | None:
    """识别未被 pymupdf4llm 标记为 # 的常见论文标题。"""

    clean = _clean_heading(line.strip())
    if SPECIAL_HEADING_PATTERN.fullmatch(clean):
        return 1, clean.rstrip(":：")
    match = NUMBERED_HEADING_PATTERN.fullmatch(clean)
    if not match:
        return None
    number = re.sub(r"\s*\.\s*", ".", match.group(1))
    label = match.group(2).strip()
    if any(symbol in label for symbol in (";", "；", "%", "/", "\\")):
        return None
    # 排除“1 张三”“2 李四”这类作者脚注，同时保留“0 引言”“4 结束语”。
    special = re.fullmatch(r"引言|绪论|结论|结束语|建议与展望|相关工作", label)
    if len(label) < 4 and not special:
        return None
    return min(number.count(".") + 1, 3), f"{number} {label}"


def _looks_like_body_line(line: str) -> bool:
    """判断一行是否更像正文而非标题续行。"""

    clean = line.strip()
    if not clean:
        return True
    if HEADING_PATTERN.match(clean) or _plain_heading(clean):
        return False
    if re.match(r"^\d", clean):
        return True
    return len(clean) > 16 or clean.endswith(("。", "；", "：", ":", ".", "!", "?", "！", "？"))


def _join_heading_fragment(title: str, fragment: str) -> str:
    """把断行标题续片拼回完整标题，如「有序」+「升级」→「有序升级」。"""

    piece = fragment.strip()
    base = title.rstrip()
    if len(piece) <= 4 and not re.search(r"[。；;：:，,]", piece) and not re.match(r"^[\d（(]", piece):
        return f"{base}{piece}"
    return f"{base} {piece}"


def _absorb_title_continuation(lines: list[str], start: int, title: str) -> tuple[int, str]:
    """吸收标题后紧跟的短续行（含被误标为 ## 的「升级」等）。"""

    absorbed = title
    cursor = start
    while cursor < len(lines):
        candidate = lines[cursor].strip()
        if not candidate:
            cursor += 1
            continue
        markdown = HEADING_PATTERN.match(candidate)
        if markdown:
            fragment = _clean_heading(markdown.group(2))
            if len(fragment) <= 4 and not re.match(r"^\d", fragment):
                absorbed = _join_heading_fragment(absorbed, fragment)
                cursor += 1
                continue
            break
        if _plain_heading(candidate):
            break
        clean = _clean_heading(candidate)
        if len(clean) <= 4 and not re.search(r"[。；;：:，,]", clean) and not re.match(r"^\d", clean):
            absorbed = _join_heading_fragment(absorbed, clean)
            cursor += 1
            continue
        break
    return cursor, absorbed


def _previous_meaningful_line(lines: list[str]) -> str | None:
    """返回列表中最后一条非空行。"""

    for item in reversed(lines):
        if item.strip():
            return item
    return None


def _normalize_markdown_lines(lines: list[str]) -> list[str]:
    """合并 PDF 提取时折断的章节编号与标题换行。"""

    merged: list[str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            index += 1
            continue

        continuation = HEADING_PATTERN.match(stripped)
        if continuation:
            fragment = _clean_heading(continuation.group(2))
            if len(fragment) <= 8 and not re.match(r"^\d", fragment):
                previous = _previous_meaningful_line(merged)
                previous_heading = HEADING_PATTERN.match(previous) if previous else None
                if previous_heading and _plain_heading(_clean_heading(previous_heading.group(2))):
                    marks = previous_heading.group(1)
                    previous_title = _clean_heading(previous_heading.group(2))
                    merged[merged.index(previous)] = f"{marks} {_join_heading_fragment(previous_title, fragment)}"
                    index += 1
                    continue

        prefix_match = re.fullmatch(r"(\d+(?:\.\d+)*)\.", stripped)
        if prefix_match and index + 1 < len(lines):
            next_line = lines[index + 1].strip()
            child_match = re.match(r"^(\d+)\s+(.+)$", next_line)
            if child_match:
                merged.append(f"{prefix_match.group(1)}.{child_match.group(1)} {child_match.group(2)}")
                index += 2
                continue

        heading = _plain_heading(stripped) or (
            HEADING_PATTERN.match(stripped) and _plain_heading(_clean_heading(HEADING_PATTERN.match(stripped).group(2)))
        )
        if heading and index + 1 < len(lines):
            next_line = lines[index + 1].strip()
            if next_line and not _looks_like_body_line(next_line):
                combined = f"{stripped} {next_line}"
                combined_heading = _plain_heading(combined) or (
                    HEADING_PATTERN.match(combined)
                    and _plain_heading(_clean_heading(HEADING_PATTERN.match(combined).group(2)))
                )
                if combined_heading:
                    merged.append(combined)
                    index += 2
                    continue

        merged.append(line)
        index += 1
    return merged


def _is_noise_line(line: str) -> bool:
    """过滤 PDF 字体映射失败产生的明显乱码页眉。"""

    return line.count("�") >= 2


def _normalize_numbered_paths(chunks: list[DocumentChunk]) -> None:
    """在全文标题收集完成后补齐先出现子章节的父级路径。"""

    titles: dict[str, str] = {}
    for chunk in chunks:
        if chunk.content_type != ContentType.TITLE:
            continue
        match = re.match(r"^(\d+(?:\.\d+){0,2})\s", chunk.content)
        if match:
            titles[match.group(1)] = chunk.content
    for chunk in chunks:
        leaf = chunk.chapter_path.split("/")[-1]
        match = re.match(r"^(\d+(?:\.\d+){1,2})\s", leaf)
        if not match:
            continue
        parts = match.group(1).split(".")
        path: list[str] = []
        for level in range(1, len(parts)):
            parent_number = ".".join(parts[:level])
            if parent_number in titles:
                path.append(titles[parent_number])
        path.append(leaf)
        chunk.chapter_path = "/".join(path)


def _split_text(text: str, minimum: int = 300, maximum: int = 500) -> list[str]:
    """按段落和句末标点切分正文，尽量保持 300-500 字。"""

    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []
    units = [unit.strip() for unit in re.split(r"(?<=[。！？.!?])\s+|\n\s*\n", text) if unit.strip()]
    result: list[str] = []
    buffer = ""
    for unit in units:
        # 超长单元按固定上限拆开，避免单个块失控。
        pieces = [unit[i : i + maximum] for i in range(0, len(unit), maximum)]
        for piece in pieces:
            candidate = f"{buffer}\n{piece}".strip() if buffer else piece
            if len(candidate) <= maximum:
                buffer = candidate
                continue
            if buffer:
                result.append(buffer)
            buffer = piece
            if len(buffer) >= maximum:
                result.append(buffer)
                buffer = ""
    if buffer:
        if result and len(buffer) < minimum and len(result[-1]) + len(buffer) + 1 <= maximum:
            result[-1] = f"{result[-1]}\n{buffer}"
        else:
            result.append(buffer)
    return result


def _page_number(page: dict[str, Any], fallback: int) -> int:
    """兼容 pymupdf4llm 不同版本的页码元数据。"""

    metadata = page.get("metadata") or {}
    raw = metadata.get("page", page.get("page", fallback - 1))
    try:
        number = int(raw)
    except (TypeError, ValueError):
        return fallback
    # PyMuPDF 通常使用 0 起始页码，接口统一返回人类可读的 1 起始页码。
    return number + 1 if number < fallback else number


def parse_pdf(file_path: str) -> list[DocumentChunk]:
    """解析 PDF，返回带章节、内容类型和页码的统一文本块。

    pymupdf4llm 会先依据版面信息恢复 Markdown 阅读顺序，因此双栏论文的
    栏顺序合并由底层库完成；本函数负责章节追踪和细粒度分块。
    """

    # 仅在真正解析 PDF 时加载 PyMuPDF，缩短 Web 服务冷启动时间。
    import pymupdf4llm

    path = Path(file_path)
    if path.suffix.lower() != ".pdf" or not path.is_file():
        raise ValueError("PDF 文件不存在或扩展名不正确。")

    pages = pymupdf4llm.to_markdown(str(path), page_chunks=True)
    if not isinstance(pages, list):
        pages = [{"text": str(pages), "metadata": {"page": 0}}]

    chunks: list[DocumentChunk] = []
    headings = ["", "", ""]
    numbered_titles: dict[str, str] = {}
    tail_section = False
    for fallback_page, page in enumerate(pages, start=1):
        markdown = str(page.get("text", "")).strip()
        page_num = _page_number(page, fallback_page)
        if not markdown:
            continue

        lines = _normalize_markdown_lines(markdown.splitlines())
        text_buffer: list[str] = []

        def flush_text() -> None:
            """将当前正文缓冲区转换为长度受控的块。"""

            nonlocal text_buffer
            raw_text = "\n".join(text_buffer).strip()
            text_buffer = []
            if not raw_text:
                return
            content_type = (
                ContentType.REFERENCE
                if re.search(r"参考文献|references?", _chapter_path(headings), re.I)
                else ContentType.TEXT
            )
            for content in _split_text(raw_text):
                position = f"第 {page_num} 页"
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, content),
                    chapter_path=_chapter_path(headings),
                    content=content,
                    content_type=content_type,
                    position=position,
                    page_num=page_num,
                ))

        index = 0
        while index < len(lines):
            line = lines[index].rstrip()
            heading = HEADING_PATTERN.match(line)
            if heading:
                # 参考文献后的英文摘要常被错误拆成单词级 Markdown 标题，
                # 这些并非正文目录项，应作为普通文本处理。
                if tail_section:
                    text_buffer.append(_clean_heading(line.lstrip("# ")))
                    index += 1
                    continue
                flush_text()
                level = len(heading.group(1))
                title = _clean_heading(heading.group(2))
                index, title = _absorb_title_continuation(lines, index + 1, title)
                headings[level - 1] = title
                for deeper in range(level, 3):
                    headings[deeper] = ""
                position = f"第 {page_num} 页"
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, line),
                    chapter_path=_chapter_path(headings),
                    content=title,
                    content_type=ContentType.TITLE,
                    position=position,
                    page_num=page_num,
                ))
                if title.lower() in {"参考文献", "references", "作者简介"}:
                    tail_section = True
                continue

            plain_heading = _plain_heading(line)
            if plain_heading:
                # 进入参考文献后仅保留“作者简介”这一明确区段，其余数字、
                # URL 和英文摘要碎片均不再进入主章节树。
                candidate_title = plain_heading[1]
                if tail_section and candidate_title != "作者简介":
                    text_buffer.append(line)
                    index += 1
                    continue
                flush_text()
                level, title = plain_heading
                index, title = _absorb_title_continuation(lines, index + 1, title)
                number_match = re.match(r"^(\d+(?:\.\d+){0,2})\s", title)
                if number_match:
                    number = number_match.group(1)
                    numbered_titles[number] = title
                    parts = number.split(".")
                    for parent_level in range(1, level):
                        parent_number = ".".join(parts[:parent_level])
                        headings[parent_level - 1] = numbered_titles.get(parent_number, "")
                headings[level - 1] = title
                for deeper in range(level, 3):
                    headings[deeper] = ""
                position = f"第 {page_num} 页"
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, title),
                    chapter_path=_chapter_path(headings),
                    content=title,
                    content_type=ContentType.TITLE,
                    position=position,
                    page_num=page_num,
                ))
                if title.lower() in {"参考文献", "references", "作者简介"}:
                    tail_section = True
                continue

            if TABLE_LINE_PATTERN.match(line):
                flush_text()
                table_lines: list[str] = []
                while index < len(lines) and TABLE_LINE_PATTERN.match(lines[index]):
                    table_lines.append(lines[index].rstrip())
                    index += 1
                content = "\n".join(table_lines)
                position = f"第 {page_num} 页"
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, content),
                    chapter_path=_chapter_path(headings),
                    content=content,
                    content_type=ContentType.TABLE,
                    position=position,
                    page_num=page_num,
                ))
                continue

            if FORMULA_PATTERN.match(line):
                flush_text()
                position = f"第 {page_num} 页"
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, line),
                    chapter_path=_chapter_path(headings),
                    content=line.strip(),
                    content_type=ContentType.FORMULA,
                    position=position,
                    page_num=page_num,
                ))
                index += 1
                continue

            if not _is_noise_line(line):
                text_buffer.append(line)
            index += 1
        flush_text()

    if not chunks:
        raise ValueError("PDF 中未提取到可用文本，扫描版论文请先执行 OCR。")
    _normalize_numbered_paths(chunks)
    return chunks
