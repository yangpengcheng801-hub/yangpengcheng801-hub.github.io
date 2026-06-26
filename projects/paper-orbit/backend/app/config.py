"""应用配置：统一从环境变量和 .env 文件读取。"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _resolve_project_path(value: Path | str) -> Path:
    """将 .env 中的相对路径统一解析为相对项目根目录的绝对路径。"""

    path = Path(value)
    if path.is_absolute():
        return path
    return (PROJECT_ROOT / path).resolve()


class Settings(BaseSettings):
    """全局配置对象，字段均可使用同名环境变量覆盖。"""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    app_name: str = "论文智能阅读助手"
    debug: bool = False

    llm_base_url: str = "https://api.deepseek.com"
    llm_api_key: str = ""
    llm_model_name: str = "deepseek-chat"
    llm_temperature: float = Field(default=0.1, ge=0.0, le=2.0)
    llm_timeout: int = Field(default=90, ge=10, le=600)
    llm_max_input_chars: int = Field(default=60000, ge=5000)

    embedding_model_name: str = "./models/bge-small-zh-v1.5"
    embedding_device: str = "cpu"
    enable_reranker: bool = False
    reranker_model_name: str = "./models/bge-reranker-base"
    hf_endpoint: str = "https://hf-mirror.com"
    vector_db_path: Path = PROJECT_ROOT / "data" / "vector_db"
    upload_dir: Path = PROJECT_ROOT / "data" / "uploads"
    paper_data_dir: Path = PROJECT_ROOT / "data" / "papers"
    max_upload_mb: int = Field(default=50, ge=1, le=500)

    @field_validator("vector_db_path", "upload_dir", "paper_data_dir", mode="before")
    @classmethod
    def normalize_data_paths(cls, value: Path | str) -> Path:
        return _resolve_project_path(value)

    @field_validator("embedding_model_name", "reranker_model_name", mode="before")
    @classmethod
    def normalize_model_paths(cls, value: str) -> str:
        """本地模型使用相对 backend 的路径，模型仓库名保持不变。"""

        text = str(value).strip()
        path = Path(text)
        if text.startswith(".") or "/" in text or chr(92) in text or path.parts[:1] == ("models",):
            return str(_resolve_project_path(path))
        return text

    @model_validator(mode="after")
    def apply_hf_mirror(self) -> Settings:
        if self.hf_endpoint:
            os.environ.setdefault("HF_ENDPOINT", self.hf_endpoint)
        return self

    knowledge_system_prompt: str = (
        "你是严谨的学术论文知识萃取助手。只能依据提供的论文原文输出；"
        "禁止编造任何事实、数据、公式或结论；原文没有的信息写‘原文未说明’；"
        "必须返回符合指定字段的标准 JSON，不能输出 Markdown 或其他文字。"
    )

    def ensure_directories(self) -> None:
        """创建运行所需的本地持久化目录。"""

        for path in (self.vector_db_path, self.upload_dir, self.paper_data_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """返回进程内缓存的配置实例。"""

    settings = Settings()
    settings.ensure_directories()
    return settings
