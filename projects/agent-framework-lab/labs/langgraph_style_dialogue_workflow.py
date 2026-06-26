"""LangGraph 风格教学实验：图式对话工作流。

不依赖 LangGraph。该脚本用最小图执行器模拟节点、边、条件跳转和反思循环。
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Callable, Dict, List
import json

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

USER_QUESTION = "我应该选择 AutoGen 还是 LangGraph 来做一个需要反复修改答案的智能体？"


@dataclass
class State:
    question: str
    intent: str = ""
    context: str = ""
    answer: str = ""
    quality_score: int = 0
    rewrite_count: int = 0
    trace: List[str] = field(default_factory=list)


Node = Callable[[State], State]


def classify(state: State) -> State:
    state.intent = "framework_selection" if "还是" in state.question else "general_question"
    state.trace.append("classify")
    return state


def retrieve(state: State) -> State:
    state.context = (
        "AutoGen 适合把任务表示成多个角色之间的对话协作；"
        "LangGraph 适合把任务表示成显式图结构，尤其适合循环、反思和条件跳转。"
    )
    state.trace.append("retrieve")
    return state


def answer(state: State) -> State:
    if state.rewrite_count == 0:
        state.answer = "可以根据任务选择框架。AutoGen 偏多角色对话，LangGraph 偏流程控制。"
    else:
        state.answer = (
            "建议选择 LangGraph。你的任务强调“反复修改答案”，这意味着工作流需要显式的反思节点、"
            "质量判断和条件回跳。AutoGen 更适合模拟产品经理、工程师、审查员等角色之间的协作；"
            "LangGraph 更适合把 classify、retrieve、answer、reflect、rewrite 等步骤建成可调试的图。"
        )
    state.trace.append("answer")
    return state


def reflect(state: State) -> State:
    keywords = ["反思", "条件", "回跳", "LangGraph", "AutoGen"]
    state.quality_score = sum(1 for k in keywords if k in state.answer)
    state.trace.append("reflect")
    return state


def rewrite(state: State) -> State:
    state.rewrite_count += 1
    state.trace.append("rewrite")
    return state


def should_rewrite(state: State) -> str:
    if state.quality_score < 4 and state.rewrite_count < 1:
        return "rewrite"
    return "end"


def run_graph(question: str) -> State:
    state = State(question=question)
    for node in [classify, retrieve, answer, reflect]:
        state = node(state)
    if should_rewrite(state) == "rewrite":
        state = rewrite(state)
        state = answer(state)
        state = reflect(state)
    state.trace.append("end")
    return state


def save_mermaid() -> Path:
    mermaid = """flowchart TD
    A[classify: 意图识别] --> B[retrieve: 检索框架知识]
    B --> C[answer: 生成回答]
    C --> D[reflect: 质量评估]
    D -->|质量不足| E[rewrite: 重写策略]
    E --> C
    D -->|质量通过| F[end]
"""
    out = OUT / "langgraph_style_graph.mmd"
    out.write_text(mermaid, encoding="utf-8")
    return out


def main() -> None:
    state = run_graph(USER_QUESTION)
    trace_out = OUT / "langgraph_style_trace.json"
    trace_out.write_text(json.dumps(asdict(state), ensure_ascii=False, indent=2), encoding="utf-8")
    graph_out = save_mermaid()
    print("最终回答：")
    print(state.answer)
    print(f"已保存轨迹：{trace_out.relative_to(ROOT)}")
    print(f"已保存 Mermaid 图：{graph_out.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
