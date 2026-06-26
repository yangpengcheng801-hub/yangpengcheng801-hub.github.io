"""Create a text-based PDF sample used for upload demonstrations."""

from pathlib import Path

from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
source = ROOT / "samples" / "sample_paper.txt"
target = ROOT / "samples" / "sample_paper.pdf"
styles = getSampleStyleSheet()
styles["BodyText"].fontName = "Helvetica"
styles["BodyText"].fontSize = 9
styles["BodyText"].leading = 12
styles["Heading1"].fontName = "Helvetica-Bold"
styles["Heading1"].fontSize = 14

parts = []
for index, block in enumerate(source.read_text(encoding="utf-8").split("\n\n")):
    text = block.strip()
    if not text:
        continue
    style = styles["Heading1"] if index == 0 or (len(text) < 40 and "\n" not in text) else styles["BodyText"]
    parts.append(Paragraph(text.replace("&", "&amp;"), style))
    parts.append(Spacer(1, 0.12 * inch))

doc = SimpleDocTemplate(
    str(target), pagesize=letter,
    rightMargin=0.8 * inch, leftMargin=0.8 * inch,
    topMargin=0.7 * inch, bottomMargin=0.7 * inch,
)
doc.build(parts)
print(target)

