"""AutoGen 风格教学实验：软件开发团队协作。

该文件不依赖 AutoGen，也不调用 LLM API。它用确定性规则模拟 AutoGen 的
RoundRobinGroupChat 思想：ProductManager -> Engineer -> CodeReviewer -> UserProxy。
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
OUT.mkdir(exist_ok=True)

TASK = "开发一个比特币价格显示应用：显示 BTC/USD 当前价格、24h 涨跌幅，并提供刷新功能。"


@dataclass
class Message:
    speaker: str
    content: str


@dataclass
class Agent:
    name: str
    respond: Callable[[str, List[Message]], str]


def product_manager(task: str, history: List[Message]) -> str:
    return f"""### 需求分析
任务：{task}

功能模块：
1. 数据获取：请求公开价格 API；
2. 页面展示：显示价格、涨跌幅、交易量和市值；
3. 交互：提供刷新按钮；
4. 稳定性：API 失败时显示演示数据和错误提示。

验收标准：
- 能启动 Web 页面；
- 能看到 BTC/USD 价格；
- API 失败时不崩溃；
- 页面结构清晰。

请工程师开始实现。"""


def engineer(task: str, history: List[Message]) -> str:
    source_app = (ROOT / "labs" / "streamlit_bitcoin_app.py").read_text(encoding="utf-8")
    generated = OUT / "generated_bitcoin_app.py"
    generated.write_text(source_app, encoding="utf-8")
    return f"""### 技术实现
已生成 Streamlit 应用：`{generated.relative_to(ROOT)}`。

运行方式：
```bash
pip install -r requirements_minimal.txt
streamlit run outputs/generated_bitcoin_app.py
```

实现要点：
- 使用 CoinGecko simple/price API；
- 使用 `st.metric` 展示价格和 24h 变化；
- 使用 `try/except` 处理网络和 API 异常；
- 失败时返回演示数据，保证教学环境可展示。

请代码审查员检查。"""


def code_reviewer(task: str, history: List[Message]) -> str:
    return """### 代码审查
审查结果：通过，但有 3 个生产级改进建议。

1. API 稳定性：建议增加缓存，例如 `st.cache_data(ttl=30)`，避免频繁请求。
2. 配置管理：生产环境可把 API URL、超时时间放入配置文件。
3. 用户体验：可以增加趋势图、最近刷新时间和错误详情折叠面板。

代码审查完成，请用户代理测试。"""


def user_proxy(task: str, history: List[Message]) -> str:
    return """### 用户验收
验收结论：通过。

测试项：
- 页面可启动；
- 当前价格、24h 变化、交易量、市值字段完整；
- API 失败时仍可显示演示数据；
- 交互按钮存在。

TERMINATE"""


def run_round_robin(task: str) -> List[Message]:
    agents = [
        Agent("ProductManager", product_manager),
        Agent("Engineer", engineer),
        Agent("CodeReviewer", code_reviewer),
        Agent("UserProxy", user_proxy),
    ]
    history: List[Message] = [Message("User", task)]
    for agent in agents:
        reply = agent.respond(task, history)
        history.append(Message(agent.name, reply))
        if "TERMINATE" in reply:
            break
    return history


def save_transcript(history: List[Message]) -> Path:
    transcript = OUT / "autogen_style_transcript.md"
    body = ["# AutoGen 风格软件开发团队对话日志\n"]
    for msg in history:
        body.append(f"## {msg.speaker}\n\n{msg.content}\n")
    transcript.write_text("\n".join(body), encoding="utf-8")
    return transcript


def main() -> None:
    history = run_round_robin(TASK)
    transcript = save_transcript(history)
    print(f"已生成对话日志：{transcript.relative_to(ROOT)}")
    print(f"已生成应用代码：{(OUT / 'generated_bitcoin_app.py').relative_to(ROOT)}")


if __name__ == "__main__":
    main()
