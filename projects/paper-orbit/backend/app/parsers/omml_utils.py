"""Word OMML 公式提取与简化展示。"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

MATH_NS = {
    "m": "http://schemas.openxmlformats.org/officeDocument/2006/math",
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
}


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def _collect_math_text(element: ET.Element) -> str:
    parts: list[str] = []
    for node in element.iter():
        name = _local_name(node.tag)
        if name == "t" and node.text:
            parts.append(node.text)
        elif name in {"num", "den"}:
            parts.append(_collect_math_text(node))
        elif name == "rad":
            parts.append(f"sqrt({_collect_math_text(node)})")
        elif name == "sup":
            parts.append(f"^({_collect_math_text(node)})")
        elif name == "sub":
            parts.append(f"_({_collect_math_text(node)})")
    text = "".join(parts)
    return re.sub(r"\s+", "", text)


def extract_formula_from_paragraph(paragraph) -> str | None:
    """从段落 XML 提取 Office Math 公式的可读文本。"""

    root = paragraph._p
    math_nodes = [
        node for node in root.iter()
        if _local_name(node.tag) in {"oMath", "oMathPara"}
    ]
    if not math_nodes:
      return None
    pieces = [_collect_math_text(node) for node in math_nodes]
    formula = " ".join(piece for piece in pieces if piece).strip()
    if not formula:
      return None
    return f"${formula}$"
