"""真实 AgentScope 模板：三国狼人杀实验起点。

说明：AgentScope 版本变化较快，本模板保留核心教学结构：模型配置、角色定义、消息广播、结构化行动。
使用前请根据当前 AgentScope 官方文档检查导入路径。

准备：
    pip install agentscope dashscope pydantic python-dotenv
    设置 DASHSCOPE_API_KEY
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()


class VoteModel(BaseModel):
    vote: str = Field(description="投票目标玩家姓名")
    reason: str = Field(description="投票理由")
    confidence: int = Field(ge=1, le=10, description="信心程度")


@dataclass
class PlayerConfig:
    name: str
    character: str
    game_role: str


PLAYERS = [
    PlayerConfig("刘备", "仁德宽厚", "村民"),
    PlayerConfig("关羽", "忠义刚烈", "猎人"),
    PlayerConfig("诸葛亮", "理性推理", "预言家"),
    PlayerConfig("曹操", "权谋隐藏", "狼人"),
]


def main() -> None:
    if not os.getenv("DASHSCOPE_API_KEY"):
        raise RuntimeError("请先设置 DASHSCOPE_API_KEY")

    print("本模板用于迁移到真实 AgentScope。建议先运行 labs/agentscope_style_werewolf.py 理解流程。")
    print("玩家配置：")
    for p in PLAYERS:
        print(f"- {p.name}: {p.character} / {p.game_role}")
    print("结构化投票模型字段：", VoteModel.model_fields.keys())


if __name__ == "__main__":
    main()
