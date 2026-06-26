import unittest
from pathlib import Path

from paper_agent import BailianClient, PaperDocument, PaperReaderAgent, PaperReadingOrchestrator, extract_text


ROOT = Path(__file__).resolve().parents[1]


class PaperAgentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text = (ROOT / "samples" / "sample_paper.txt").read_text(encoding="utf-8")
        cls.document = PaperDocument("sample_paper.txt", text)
        cls.agent = PaperReaderAgent()
        cls.analysis = cls.agent.analyze(cls.document)

    def test_detects_title_and_sections(self):
        self.assertIn("PaperPilot", self.document.title)
        section_types = {section["type"] for section in self.document.sections}
        self.assertIn("摘要", section_types)
        self.assertIn("方法", section_types)
        self.assertIn("结果", section_types)

    def test_analysis_contains_required_fields(self):
        for key in ("summary", "keywords", "contributions", "methods", "results"):
            self.assertTrue(self.analysis[key], key)
        self.assertGreaterEqual(len(self.analysis["keywords"]), 5)

    def test_concept_map_review_and_trace(self):
        self.assertTrue(self.analysis["concept_map"]["nodes"])
        self.assertTrue(self.analysis["review"]["strengths"])
        self.assertTrue(self.analysis["review"]["questions"])
        self.assertEqual(len(self.analysis["agent_trace"]), 3)

    def test_orchestrator_offline_fallback(self):
        client = BailianClient(api_key="")
        self.assertFalse(client.available)
        result = PaperReadingOrchestrator(client).analyze(self.document)
        self.assertEqual(result["analysis_mode"], "local")

    def test_question_answer_returns_evidence(self):
        result = self.agent.ask(self.document, "What evidence hit rate did the system achieve?")
        self.assertTrue(result["evidence"])
        combined = " ".join(e["text"] for e in result["evidence"])
        self.assertIn("86.0%", combined)

    def test_markdown_export(self):
        note = self.agent.export_markdown(self.document, self.analysis)
        self.assertIn("## 研究贡献", note)
        self.assertIn("## 实验结果", note)

    def test_pdf_extraction(self):
        pdf = ROOT / "samples" / "sample_paper.pdf"
        text = extract_text(pdf.name, pdf.read_bytes())
        self.assertIn("Evidence-Grounded Assistant", text)
        self.assertGreater(len(text), 3000)


if __name__ == "__main__":
    unittest.main()
