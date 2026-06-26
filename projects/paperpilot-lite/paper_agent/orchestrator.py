"""Multi-agent orchestration for local analysis plus optional Qwen enhancement."""

from __future__ import annotations

from .core import PaperDocument, PaperReaderAgent
from .llm import BailianClient


class PaperReadingOrchestrator:
    def __init__(self, llm: BailianClient | None = None):
        self.local_agent = PaperReaderAgent()
        self.llm = llm or BailianClient()

    @property
    def mode(self) -> str:
        return "bailian" if self.llm.available else "local"

    def analyze(self, document: PaperDocument) -> dict:
        analysis = self.local_agent.analyze(document)
        if not self.llm.available:
            return analysis
        try:
            enhanced = self.llm.enhance_analysis(document.text, analysis)
            for key in ("one_liner", "summary", "contributions", "methods", "results", "review"):
                value = enhanced.get(key)
                if value:
                    analysis[key] = value
            analysis["analysis_mode"] = "bailian"
            analysis["agent_trace"].append({
                "agent": "Qwen Synthesis Agent",
                "task": f"使用 {self.llm.model} 进行深度综合与审稿",
                "status": "done",
            })
        except Exception as exc:
            analysis["llm_warning"] = str(exc)
            analysis["agent_trace"].append({
                "agent": "Qwen Synthesis Agent",
                "task": "大模型增强失败，已自动回退本地结果",
                "status": "fallback",
            })
        return analysis

    def ask(self, document: PaperDocument, question: str) -> dict:
        result = self.local_agent.ask(document, question)
        result["mode"] = "local"
        if not self.llm.available:
            return result
        try:
            result["answer"] = self.llm.answer_with_evidence(question, result["evidence"])
            result["mode"] = "bailian"
        except Exception as exc:
            result["warning"] = str(exc)
        return result

    def export_markdown(self, document: PaperDocument, analysis: dict) -> str:
        return self.local_agent.export_markdown(document, analysis)

