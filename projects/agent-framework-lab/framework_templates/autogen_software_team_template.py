"""真实 AutoGen 模板：软件开发团队协作。

准备：
    pip install autogen-agentchat autogen-ext[openai] python-dotenv
    cp .env.example .env
    # 填写 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL_ID

运行：
    python framework_templates/autogen_software_team_template.py
"""

from __future__ import annotations

import asyncio
import os
from dotenv import load_dotenv

from autogen_agentchat.agents import AssistantAgent, UserProxyAgent
from autogen_agentchat.conditions import TextMentionTermination
from autogen_agentchat.teams import RoundRobinGroupChat
from autogen_agentchat.ui import Console
from autogen_core.models import ModelFamily, ModelInfo
from autogen_ext.models.openai import OpenAIChatCompletionClient

load_dotenv()


def create_model_client() -> OpenAIChatCompletionClient:
    return OpenAIChatCompletionClient(
        model=os.getenv("LLM_MODEL_ID", "gpt-4o-mini"),
        api_key=os.getenv("LLM_API_KEY"),
        base_url=os.getenv("LLM_BASE_URL", "https://api.openai.com/v1"),
        max_tokens=4096,
        model_info=ModelInfo(
            vision=False,
            function_calling=True,
            json_output=True,
            family=ModelFamily.ANY,
            structured_output=True,
        ),
    )


def make_agent(name: str, role_prompt: str, model_client: OpenAIChatCompletionClient) -> AssistantAgent:
    return AssistantAgent(name=name, model_client=model_client, system_message=role_prompt)


async def main() -> None:
    model_client = create_model_client()

    product_manager = make_agent(
        "ProductManager",
        "你是产品经理。请把用户需求拆成可执行需求、功能模块、验收标准。最后说：请工程师开始实现。",
        model_client,
    )
    engineer = make_agent(
        "Engineer",
        "你是 Python 工程师。请根据需求输出 Streamlit 应用代码。最后说：请代码审查员检查。",
        model_client,
    )
    reviewer = make_agent(
        "CodeReviewer",
        "你是代码审查员。请检查健壮性、安全性、可维护性，并给出修改建议。最后说：代码审查完成，请用户代理测试。",
        model_client,
    )
    user_proxy = UserProxyAgent(
        name="UserProxy",
        description="代表用户验收。任务满足要求后回复 TERMINATE。",
        input_func=lambda prompt, cancellation_token=None: "TERMINATE",
    )

    team = RoundRobinGroupChat(
        participants=[product_manager, engineer, reviewer, user_proxy],
        termination_condition=TextMentionTermination("TERMINATE"),
        max_turns=12,
    )

    task = "开发一个 Streamlit 比特币价格看板：显示 BTC/USD 当前价格、24h 涨跌幅，并提供刷新按钮。"
    await Console(team.run_stream(task=task))


if __name__ == "__main__":
    asyncio.run(main())
