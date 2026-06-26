"""使用 python-docx 将 Word 论文解析为统一结构化文本块。"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Iterator
from pathlib import Path

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.schemas.models import ContentType, DocumentChunk

from app.parsers.omml_utils import extract_formula_from_paragraph


def _iter_blocks(document: DocumentObject) -> Iterator[Paragraph | Table]:
    """按 Word XML 中的真实顺序遍历段落和表格。"""

    for child in document.element.body.iterchildren():
        if isinstance(child, CT_P):
            yield Paragraph(child, document)
        elif isinstance(child, CT_Tbl):
            yield Table(child, document)


def _chunk_id(position: str, content: str) -> str:
    """根据位置和内容生成稳定块 ID。"""

    digest = hashlib.sha1(f"{position}\n{content}".encode("utf-8")).hexdigest()[:16]
    return f"word_{digest}"


def _heading_level(style_name: str) -> int | None:
    """同时识别中英文 Word 标题样式。"""

    normalized = style_name.strip().lower().replace(" ", "")
    match = re.search(r"(?:heading|标题)([123])", normalized)
    return int(match.group(1)) if match else None


def _table_to_markdown(table: Table) -> str:
    """把 Word 表格转换为 Markdown 表格。"""

    rows = [[cell.text.strip().replace("\n", " ") for cell in row.cells] for row in table.rows]
    if not rows:
        return ""
    width = max(len(row) for row in rows)
    normalized = [row + [""] * (width - len(row)) for row in rows]
    header = normalized[0]
    lines = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in normalized[1:])
    return "\n".join(lines)


def _has_formula(paragraph: Paragraph) -> bool:
    """检测段落 XML 中是否包含 Office Math 公式节点。"""

    return bool(paragraph._p.xpath(".//*[local-name()='oMath' or local-name()='oMathPara']"))


def _chapter_path(headings: list[str]) -> str:
    """将标题栈转换为章节路径。"""

    return "/".join(item for item in headings if item) or "全文"


def parse_word(file_path: str) -> list[DocumentChunk]:
    """解析 DOCX，输出与 PDF 解析器字段完全一致的文本块列表。"""

    path = Path(file_path)
    if path.suffix.lower() != ".docx" or not path.is_file():
        raise ValueError("Word 文件不存在或扩展名不正确，仅支持 .docx。")

    document = Document(str(path))
    chunks: list[DocumentChunk] = []
    headings = ["", "", ""]
    block_index = 0

    for block in _iter_blocks(document):
        block_index += 1
        position = f"段落 {block_index}"
        if isinstance(block, Table):
            content = _table_to_markdown(block)
            if content:
                chunks.append(DocumentChunk(
                    chunk_id=_chunk_id(position, content),
                    chapter_path=_chapter_path(headings),
                    content=content,
                    content_type=ContentType.TABLE,
                    position=f"{position}（表格）",
                    page_num=None,
                ))
            continue

        text = block.text.strip()
        formula = _has_formula(block)
        if not text and not formula:
            continue

        level = _heading_level(block.style.name if block.style else "")
        if level is not None and text:
            headings[level - 1] = text
            for deeper in range(level, 3):
                headings[deeper] = ""
            content_type = ContentType.TITLE
        elif formula:
            extracted = extract_formula_from_paragraph(block)
            if extracted:
                text = f"{text}\n{extracted}".strip() if text else extracted
            elif not text:
                text = f"[公式 · {position}]"
            content_type = ContentType.FORMULA
        elif re.search(r"参考文献|references?", _chapter_path(headings), re.I):
            content_type = ContentType.REFERENCE
        else:
            content_type = ContentType.TEXT

        chunks.append(DocumentChunk(
            chunk_id=_chunk_id(position, text),
            chapter_path=_chapter_path(headings),
            content=text,
            content_type=content_type,
            position=position,
            page_num=None,
        ))

    if not chunks:
        raise ValueError("Word 文档中未提取到可用正文。")
    return chunks

