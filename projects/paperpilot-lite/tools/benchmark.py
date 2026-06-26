"""Reproducible benchmark for the bundled sample paper."""

from __future__ import annotations

import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from paper_agent import PaperDocument, PaperReaderAgent
CASES = [
    ("What evidence hit rate did the complete pipeline achieve?", "86.0%"),
    ("What was the keyword-only baseline hit rate?", "68.7%"),
    ("How many question-answer cases were evaluated?", "150"),
    ("How many research-style documents were used?", "30"),
    ("What was the median processing time?", "0.42 seconds"),
    ("What file types can the parser process?", "PDF, TXT, or Markdown"),
    ("What are the main PDF-related errors?", "scanned PDFs"),
    ("What does each answer link to?", "source paragraphs"),
    ("What future retrieval method is proposed?", "embedding retrieval"),
    ("Why is the prototype suitable for classroom demonstrations?", "without a paid model API"),
    ("How many reading questions were paired with each document?", "five reading questions"),
    ("What is the key design principle?", "traceability"),
]


def main() -> None:
    text = (ROOT / "samples" / "sample_paper.txt").read_text(encoding="utf-8")
    document = PaperDocument("sample_paper.txt", text)
    agent = PaperReaderAgent()

    hits = []
    for question, expected in CASES:
        result = agent.ask(document, question)
        evidence = " ".join(item["text"] for item in result["evidence"])
        hits.append({"question": question, "expected": expected, "hit": expected.lower() in evidence.lower()})

    timings = []
    for _ in range(200):
        start = time.perf_counter()
        agent.analyze(document)
        timings.append((time.perf_counter() - start) * 1000)

    report = {
        "document_characters": len(document.text),
        "question_cases": len(CASES),
        "evidence_hits": sum(item["hit"] for item in hits),
        "evidence_hit_rate_percent": round(sum(item["hit"] for item in hits) / len(hits) * 100, 1),
        "analysis_runs": len(timings),
        "median_analysis_ms": round(statistics.median(timings), 3),
        "p95_analysis_ms": round(sorted(timings)[int(len(timings) * 0.95) - 1], 3),
        "cases": hits,
    }
    out = ROOT / "docs" / "benchmark.json"
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
