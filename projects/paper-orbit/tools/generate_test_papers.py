"""确保 test-papers 目录包含主测试论文。"""

from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "test-papers"
OUT.mkdir(parents=True, exist_ok=True)

TEST_PDF_NAME = "人工智能促进数据中心绿色节能研究.pdf"
TEST_PDF = OUT / TEST_PDF_NAME

# 开发机上的默认来源；可通过环境变量 TEST_PAPER_SOURCE 覆盖。
DEFAULT_SOURCES = [
  Path(r"e:\下载") / TEST_PDF_NAME,
  ROOT.parent / "paper-reading-assistant" / "samples" / "sample_paper.pdf",
]


def resolve_source() -> Path | None:
  import os

  override = os.environ.get("TEST_PAPER_SOURCE", "").strip()
  if override:
    candidate = Path(override)
    return candidate if candidate.is_file() else None
  for candidate in DEFAULT_SOURCES:
    if candidate.is_file():
      return candidate
  return None


def main() -> None:
  if TEST_PDF.is_file():
    print(f"[OK] 测试论文已存在: {TEST_PDF}")
    return

  source = resolve_source()
  if source is None:
    raise FileNotFoundError(
      f"未找到测试论文。请将 PDF 放入 {TEST_PDF}，"
      "或设置环境变量 TEST_PAPER_SOURCE 指向源文件。"
    )

  shutil.copy2(source, TEST_PDF)
  print(f"[OK] 已复制测试论文: {source} -> {TEST_PDF}")


if __name__ == "__main__":
  main()
