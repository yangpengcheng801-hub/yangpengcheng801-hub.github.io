"""论文文件解析器。"""

from .pdf_parser import parse_pdf
from .word_parser import parse_word

__all__ = ["parse_pdf", "parse_word"]

