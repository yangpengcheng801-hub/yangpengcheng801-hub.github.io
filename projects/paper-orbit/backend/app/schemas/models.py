"""全项目共享的 Pydantic 数据模型。"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class ContentType(str, Enum):
    """论文内容块类型。"""

    TITLE = "title"
    TEXT = "text"
    FORMULA = "formula"
    TABLE = "table"
    REFERENCE = "reference"


class DocumentChunk(BaseModel):
    """PDF 与 Word 解析器统一输出的原文块。"""

    model_config = ConfigDict(use_enum_values=True)

    chunk_id: str = Field(description="文档内唯一块标识")
    chapter_path: str = Field(default="全文", description="所属章节路径")
    content: str = Field(min_length=1, description="文本内容")
    content_type: ContentType = Field(description="内容类型")
    position: str = Field(description="页码或段落序号等位置标识")
    page_num: int | None = Field(default=None, description="PDF 页码，Word 为 None")


class PaperKnowledge(BaseModel):
    """由论文原文萃取的结构化核心知识。"""

    research_background: str = "原文未说明"
    core_innovations: list[str] = Field(default_factory=list)
    method_framework: str = "原文未说明"
    key_formulas: list[str] = Field(default_factory=list)
    datasets: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    experiment_conclusion: str = "原文未说明"
    limitations: str = "原文未说明"
    application_scenarios: str = "原文未说明"


class ChatMessage(BaseModel):
    """多轮对话中的单条历史消息。"""

    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    """论文问答请求。"""

    query: str = Field(min_length=1, max_length=2000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)
    top_k: int = Field(default=4, ge=1, le=10)


class SourceItem(BaseModel):
    """问答结果引用的原文来源。"""

    chunk_id: str
    chapter_path: str
    position: str
    content_type: str
    content: str
    page_num: int | None = None


class ChatResponse(BaseModel):
    """论文问答响应。"""

    answer: str
    sources: list[SourceItem]


class ChapterOutline(BaseModel):
    """章节导航条目，用于前端目录跳转。"""

    path: str
    title: str
    chunk_id: str
    page_num: int | None = None


class PaperSummary(BaseModel):
    """论文列表摘要。"""

    paper_id: str
    filename: str
    chunk_count: int


class KnowledgeResponse(BaseModel):
    """知识萃取结果及元信息。"""

    knowledge: PaperKnowledge
    truncated: bool = False
    input_chars: int = 0


class UploadResponse(BaseModel):
    """论文上传与解析响应。"""

    paper_id: str
    filename: str
    chunk_count: int
    structure: list[str]
    outline: list[ChapterOutline] = Field(default_factory=list)

