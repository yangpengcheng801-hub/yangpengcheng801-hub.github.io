"""Core algorithms for the PaperPilot paper reading assistant.

The default pipeline is deterministic and offline-friendly.  It intentionally
keeps evidence paragraph identifiers so every answer can be checked against the
uploaded paper.
"""

from __future__ import annotations

import io
import math
import re
import uuid
from collections import Counter
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Iterable


EN_STOPWORDS = {
    "the", "and", "for", "that", "with", "this", "from", "are", "was", "were",
    "has", "have", "had", "into", "using", "used", "our", "their", "these",
    "those", "than", "then", "also", "can", "could", "may", "more", "most",
    "such", "each", "between", "which", "while", "where", "when", "what",
    "paper", "study", "result", "results", "method", "methods", "based",
}

ZH_STOPWORDS = {
    "本文", "研究", "方法", "结果", "进行", "通过", "以及", "一种", "基于", "可以",
    "提出", "为了", "其中", "采用", "实验", "分析", "数据", "模型", "系统", "相关",
    "具有", "实现", "应用", "问题", "主要", "进一步", "不同", "对于", "能够", "得到",
}

SECTION_HINTS = {
    "abstract": "摘要", "摘要": "摘要",
    "introduction": "引言", "引言": "引言", "绪论": "引言",
    "related work": "相关工作", "literature review": "相关工作", "相关工作": "相关工作",
    "method": "方法", "methodology": "方法", "approach": "方法", "方法": "方法",
    "experiment": "实验", "experiments": "实验", "实验": "实验",
    "results": "结果", "result": "结果", "结果": "结果",
    "discussion": "讨论", "讨论": "讨论",
    "conclusion": "结论", "conclusions": "结论", "结论": "结论",
    "references": "参考文献", "参考文献": "参考文献",
}


@dataclass
class Evidence:
    paragraph_id: int
    score: float
    text: str


@dataclass
class PaperDocument:
    filename: str
    text: str
    doc_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    title: str = ""
    paragraphs: list[str] = field(default_factory=list)
    sections: list[dict] = field(default_factory=list)

    def __post_init__(self) -> None:
        self.text = normalize_text(self.text)
        self.paragraphs = split_paragraphs(self.text)
        self.title = detect_title(self.text, self.filename)
        self.sections = detect_sections(self.text)


def normalize_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n[ \t]+", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_text(filename: str, data: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("缺少 pypdf，请先运行 pip install -r requirements.txt") from exc
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for index, page in enumerate(reader.pages, start=1):
            content = page.extract_text() or ""
            pages.append(f"\n[第{index}页]\n{content}")
        text = "\n".join(pages)
        if len(text.strip()) < 80:
            raise ValueError("PDF 中未提取到足够文本，可能是扫描件，请先进行 OCR。")
        return normalize_text(text)
    if suffix not in {".txt", ".md", ".markdown"}:
        raise ValueError("仅支持 PDF、TXT 和 Markdown 文件。")
    for encoding in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            return normalize_text(data.decode(encoding))
        except UnicodeDecodeError:
            continue
    raise ValueError("文件编码无法识别，请转换为 UTF-8。")


def split_paragraphs(text: str) -> list[str]:
    raw = re.split(r"\n\s*\n|(?<=。)\s*\n|(?<=[.!?])\s*\n", text)
    paragraphs = [re.sub(r"\s+", " ", p).strip() for p in raw]
    return [p for p in paragraphs if len(p) >= 18]


def split_sentences(text: str) -> list[str]:
    chunks = re.split(r"(?<=[。！？!?])\s*|(?<=[.!?])\s+(?=[A-Z0-9])", text)
    return [re.sub(r"\s+", " ", s).strip(" \n") for s in chunks if 20 <= len(s.strip()) <= 700]


def detect_title(text: str, filename: str) -> str:
    for line in text.splitlines()[:15]:
        candidate = re.sub(r"^[#\s]+", "", line).strip()
        if 6 <= len(candidate) <= 160 and not re.match(r"^\[第\d+页\]$", candidate):
            if candidate.lower() not in SECTION_HINTS:
                return candidate
    return Path(filename).stem


def detect_sections(text: str) -> list[dict]:
    lines = text.splitlines()
    found: list[tuple[int, str, str]] = []
    heading_re = re.compile(r"^(?:\d+(?:\.\d+)*[ .、]?)?([A-Za-z][A-Za-z ]{2,35}|[\u4e00-\u9fff]{2,10})$")
    for idx, line in enumerate(lines):
        clean = re.sub(r"^[#\s]+", "", line).strip().rstrip(":：")
        match = heading_re.match(clean)
        if not match:
            continue
        key = re.sub(r"^\d+(?:\.\d+)*[ .、]?", "", clean).lower().strip()
        canonical = next((label for hint, label in SECTION_HINTS.items() if key == hint or key.startswith(hint + " ")), None)
        if canonical:
            found.append((idx, clean, canonical))
    sections = []
    for pos, (line_idx, heading, canonical) in enumerate(found):
        end = found[pos + 1][0] if pos + 1 < len(found) else min(len(lines), line_idx + 80)
        preview = " ".join(line.strip() for line in lines[line_idx + 1:end] if line.strip())[:260]
        sections.append({"heading": heading, "type": canonical, "preview": preview})
    if not sections:
        sections.append({"heading": "全文", "type": "全文", "preview": normalize_text(text)[:260]})
    return sections[:12]


def _tokens(text: str) -> list[str]:
    words = [w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9-]{2,}", text)]
    words = [w for w in words if w not in EN_STOPWORDS]
    chinese_spans = re.findall(r"[\u4e00-\u9fff]{2,}", text)
    zh_tokens: list[str] = []
    for span in chinese_spans:
        if span in ZH_STOPWORDS:
            continue
        if 2 <= len(span) <= 8:
            zh_tokens.append(span)
        else:
            zh_tokens.extend(span[i:i + 2] for i in range(len(span) - 1))
    return words + [t for t in zh_tokens if t not in ZH_STOPWORDS]


def extract_keywords(text: str, limit: int = 10) -> list[str]:
    counts = Counter(_tokens(text))
    scored = []
    total = max(1, sum(counts.values()))
    for token, count in counts.items():
        if count < 2 and len(text) > 1200:
            continue
        specificity = 1.15 if len(token) >= 5 else 1.0
        scored.append((count / total * specificity * math.log(2 + len(token)), token))
    scored.sort(reverse=True)
    result = []
    for _, token in scored:
        if any(token in old or old in token for old in result):
            continue
        result.append(token)
        if len(result) >= limit:
            break
    return result


def summarize(text: str, keywords: Iterable[str], max_sentences: int = 5) -> list[str]:
    sentences = split_sentences(text)
    if not sentences:
        return [normalize_text(text)[:500]] if text else []
    keys = set(k.lower() for k in keywords)
    scored = []
    for index, sentence in enumerate(sentences):
        sentence_tokens = _tokens(sentence)
        overlap = sum(1 for token in sentence_tokens if token in keys)
        position_bonus = 1.3 if index < max(4, len(sentences) // 10) else 1.0
        length_score = min(len(sentence), 220) / 220
        signal = 1.5 if re.search(r"本文|提出|结果|表明|contribution|propose|results? show", sentence, re.I) else 1.0
        score = (overlap + 0.6 * length_score) * position_bonus * signal
        scored.append((score, index, sentence))
    chosen = sorted(sorted(scored, reverse=True)[:max_sentences], key=lambda item: item[1])
    return [item[2] for item in chosen]


def _extract_signal_sentences(text: str, patterns: list[str], limit: int = 3) -> list[str]:
    sentences = split_sentences(text)
    matches = [s for s in sentences if any(re.search(p, s, re.I) for p in patterns)]
    return matches[:limit]


def build_concept_map(text: str, keywords: list[str], max_nodes: int = 7) -> dict:
    """Create a lightweight co-occurrence graph for the paper's main concepts."""
    nodes = keywords[:max_nodes]
    counts = Counter(_tokens(text))
    edges: Counter[tuple[str, str]] = Counter()
    for sentence in split_sentences(text):
        lower = sentence.lower()
        present = [node for node in nodes if node.lower() in lower]
        for left_index, left in enumerate(present):
            for right in present[left_index + 1:]:
                edge = tuple(sorted((left, right)))
                edges[edge] += 1
    edge_list = [
        {"source": source, "target": target, "weight": weight}
        for (source, target), weight in edges.most_common(12)
    ]
    if not edge_list and len(nodes) > 1:
        edge_list = [
            {"source": nodes[index], "target": nodes[index + 1], "weight": 1}
            for index in range(len(nodes) - 1)
        ]
    return {
        "nodes": [{"id": node, "weight": counts.get(node.lower(), counts.get(node, 1))} for node in nodes],
        "edges": edge_list,
    }


def build_local_review(text: str, contributions: list[str], results: list[str], keywords: list[str]) -> dict:
    limitations = _extract_signal_sentences(
        text,
        [r"限制|不足|误差|失败|仍需|难以", r"limit|error|fail|cannot|however|future work"],
        limit=3,
    )
    strengths = (contributions + results)[:3]
    seed = "、".join(keywords[:3]) or "核心方法"
    questions = [
        f"{seed} 在更大规模或跨领域数据上是否仍然有效？",
        "与更强基线或消融设置相比，各模块分别贡献了多少提升？",
        "作者公开的信息是否足以复现实验，并验证主要结论？",
    ]
    return {
        "strengths": strengths or ["论文给出了可定位的研究目标与技术路线。"],
        "limitations": limitations or ["原文未集中陈述局限，仍需结合实验设置人工判断外部有效性。"],
        "questions": questions,
    }


class PaperReaderAgent:
    """Offline paper agent with extractive summarization and evidence retrieval."""

    def analyze(self, document: PaperDocument) -> dict:
        keywords = extract_keywords(document.text)
        summary = summarize(document.text, keywords)
        contributions = _extract_signal_sentences(
            document.text,
            [r"本文.{0,12}(提出|设计|构建|实现)", r"主要贡献", r"we (propose|introduce|develop|present)", r"contribution"],
        )
        methods = _extract_signal_sentences(
            document.text,
            [r"采用|方法|算法|框架|流程", r"method|approach|framework|algorithm|pipeline"],
        )
        results = _extract_signal_sentences(
            document.text,
            [r"实验.{0,18}(表明|结果|提升|降低)", r"准确率|召回率|F1|效率", r"results? (show|indicate)|improv|accuracy|recall|f1"],
        )
        review = build_local_review(document.text, contributions or summary[:2], results, keywords)
        return {
            "doc_id": document.doc_id,
            "filename": document.filename,
            "title": document.title,
            "statistics": {
                "characters": len(document.text),
                "paragraphs": len(document.paragraphs),
                "sections": len(document.sections),
                "estimated_reading_minutes": max(1, round(len(document.text) / 650)),
            },
            "one_liner": summary[0] if summary else "未能生成摘要。",
            "summary": summary,
            "keywords": keywords,
            "contributions": contributions or summary[:2],
            "methods": methods or ["未识别到明确的方法描述，请结合原文章节核对。"],
            "results": results or ["未识别到明确的实验结果句，请检查实验或结论章节。"],
            "sections": document.sections,
            "concept_map": build_concept_map(document.text, keywords),
            "review": review,
            "agent_trace": [
                {"agent": "Document Agent", "task": "解析文本、段落与章节", "status": "done"},
                {"agent": "Analysis Agent", "task": "生成摘要、关键词与科研要素", "status": "done"},
                {"agent": "Critic Agent", "task": "归纳优势、局限与追问", "status": "done"},
            ],
            "analysis_mode": "local",
        }

    def ask(self, document: PaperDocument, question: str, top_k: int = 3) -> dict:
        question = question.strip()
        if not question:
            raise ValueError("问题不能为空。")
        query_tokens = set(_tokens(question))
        evidence: list[Evidence] = []
        for idx, paragraph in enumerate(document.paragraphs, start=1):
            p_tokens = _tokens(paragraph)
            overlap = sum(1 for token in p_tokens if token in query_tokens)
            fuzzy = sum(1 for q in query_tokens if len(q) >= 3 and q.lower() in paragraph.lower())
            section_signal = 0.5 if re.search(r"结果|结论|方法|result|conclusion|method", paragraph, re.I) else 0
            score = overlap + fuzzy * 0.8 + section_signal
            if score > 0:
                evidence.append(Evidence(idx, round(score, 3), paragraph[:800]))
        evidence.sort(key=lambda item: item.score, reverse=True)
        selected = evidence[:top_k]
        if not selected:
            selected = [Evidence(i + 1, 0.1, p[:800]) for i, p in enumerate(document.paragraphs[:top_k])]
        answer_parts = []
        for item in selected:
            sentences = split_sentences(item.text)
            answer_parts.append((sentences[0] if sentences else item.text) + f" [证据P{item.paragraph_id}]")
        answer = "综合论文中最相关的内容：" + " ".join(answer_parts)
        return {"question": question, "answer": answer, "evidence": [asdict(item) for item in selected]}

    def export_markdown(self, document: PaperDocument, analysis: dict) -> str:
        def bullets(items: list[str]) -> str:
            return "\n".join(f"- {item}" for item in items)

        sections = "\n".join(f"- {s['heading']}（{s['type']}）" for s in analysis["sections"])
        return f"""# {analysis['title']}

> 由 PaperPilot 论文阅读助手生成；关键结论请回到原文核对。

## 一句话速览

{analysis['one_liner']}

## 结构化摘要

{bullets(analysis['summary'])}

## 关键词

{', '.join(analysis['keywords'])}

## 研究贡献

{bullets(analysis['contributions'])}

## 方法

{bullets(analysis['methods'])}

## 实验结果

{bullets(analysis['results'])}

## 审稿式分析

### 优势
{bullets(analysis.get('review', {}).get('strengths', []))}

### 局限
{bullets(analysis.get('review', {}).get('limitations', []))}

### 值得继续追问
{bullets(analysis.get('review', {}).get('questions', []))}

## 章节结构

{sections}
"""
