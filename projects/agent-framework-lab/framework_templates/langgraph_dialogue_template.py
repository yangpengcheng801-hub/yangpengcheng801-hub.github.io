"""真实 LangGraph 模板：可反思的图式问答工作流。

准备：
    pip install langgraph langchain-openai python-dotenv
    cp .env.example .env
    # 填写 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL_ID

运行：
    python framework_templates/langgraph_dialogue_template.py
"""

from __future__ import annotations

from typing import TypedDict
import os
from dotenv import load_dotenv

from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

load_dotenv()


class AgentState(TypedDict):
    question: str
    context: str
    answer: str
    score: int
    rewrite_count: int


llm = ChatOpenAI(
    model=os.getenv("LLM_MODEL_ID", "gpt-4o-mini"),
    api_key=os.getenv("LLM_API_KEY"),
    base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
    temperature=0,
)


def retrieve(state: AgentState) -> AgentState:
    state["context"] = "AutoGen 擅长多角色对话协作；LangGraph 擅长显式图工作流、条件跳转和反思循环。"
    return state


def answer(state: AgentState) -> AgentState:
    prompt = f"基于上下文回答问题。\n上下文：{state['context']}\n问题：{state['question']}"
    state["answer"] = llm.invoke(prompt).content
    return state


def reflect(state: AgentState) -> AgentState:
    prompt = f"请给下面回答按 1-5 分评分，只输出数字。\n回答：{state['answer']}"
    raw = llm.invoke(prompt).content.strip()
    try:
        state["score"] = int(raw[0])
    except Exception:
        state["score"] = 3
    return state


def rewrite(state: AgentState) -> AgentState:
    state["rewrite_count"] += 1
    state["answer"] = ""
    return state


def route(state: AgentState) -> str:
    if state["score"] < 4 and state["rewrite_count"] < 1:
        return "rewrite"
    return "end"


def build_graph():
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", retrieve)
    graph.add_node("answer", answer)
    graph.add_node("reflect", reflect)
    graph.add_node("rewrite", rewrite)

    graph.set_entry_point("retrieve")
    graph.add_edge("retrieve", "answer")
    graph.add_edge("answer", "reflect")
    graph.add_conditional_edges("reflect", route, {"rewrite": "rewrite", "end": END})
    graph.add_edge("rewrite", "answer")
    return graph.compile()


if __name__ == "__main__":
    app = build_graph()
    result = app.invoke({
        "question": "我应该选择 AutoGen 还是 LangGraph 来做一个需要反复修改答案的智能体？",
        "context": "",
        "answer": "",
        "score": 0,
        "rewrite_count": 0,
    })
    print(result["answer"])
