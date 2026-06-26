"""CAMEL 风格教学实验：数字图书写作。

不依赖 CAMEL。该脚本模拟两个角色围绕同一任务进行角色扮演式协作。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

BOOK_TOPIC = "面向本科生的智能体框架开发实践"


@dataclass
class Turn:
    role: str
    content: str


def writer_plan(topic: str) -> str:
    return f"""我将围绕《{topic}》设计一本短教材。

目标读者：具备 Python 基础、初次接触智能体框架的学生。
核心主线：从单智能体到多智能体，从对话协作到图式工作流。
建议目录：
1. 为什么需要智能体框架
2. 对话驱动协作：AutoGen 思想
3. 消息驱动系统：AgentScope 思想
4. 角色扮演协作：CAMEL 思想
5. 图式工作流：LangGraph 思想
6. 综合实验：构建一个小型智能体应用
"""


def editor_feedback(plan: str) -> str:
    return """编辑反馈：
1. 目录逻辑清晰，但每章需要加入一个可运行任务；
2. 建议把“框架概念”与“代码实验”交替呈现；
3. 第 6 章应设置综合验收标准，例如日志、流程图、角色设定和错误处理；
4. 建议增加一张总表，对比四类框架的适用场景。
"""


def writer_sample_chapter(topic: str) -> str:
    return f"""## 样章：为什么需要智能体框架

在初学阶段，我们可以用几十行 Python 代码模拟 ReAct、Plan-and-Solve 或 Reflection。
这些代码适合理解原理，但不适合长期维护。真实项目通常需要处理模型切换、工具注册、状态管理、日志追踪和错误恢复。

智能体框架的价值正在于把这些重复性能力抽象出来。例如，对话式框架把任务解决过程表示为多角色协作；消息式框架强调智能体之间的通信协议；图式框架则把任务拆为节点和边，并允许条件跳转和循环修正。

因此，学习《{topic}》的关键不是背 API，而是理解框架背后的工程化抽象。
"""


def run_role_play(topic: str) -> List[Turn]:
    turns = []
    plan = writer_plan(topic)
    turns.append(Turn("Writer", plan))
    feedback = editor_feedback(plan)
    turns.append(Turn("Editor", feedback))
    sample = writer_sample_chapter(topic)
    turns.append(Turn("Writer", sample))
    turns.append(Turn("Editor", "样章通过。建议下一步补充运行截图和实验任务单。"))
    return turns


def main() -> None:
    turns = run_role_play(BOOK_TOPIC)
    out = OUT / "camel_style_digital_book.md"
    body = [f"# CAMEL 风格数字图书写作实验：{BOOK_TOPIC}\n"]
    for turn in turns:
        body.append(f"## {turn.role}\n\n{turn.content}\n")
    out.write_text("\n".join(body), encoding="utf-8")
    print(f"已生成数字图书草稿：{out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
