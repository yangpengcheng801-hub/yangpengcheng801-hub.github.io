"""真实 CAMEL 模板：数字图书写作角色扮演实验起点。

说明：CAMEL-AI 的安装包与 API 随版本变化较快，本模板强调实验结构：
assistant role、user role、task prompt、multi-turn role playing。

准备：
    pip install camel-ai python-dotenv
    配置 OPENAI_API_KEY 或 CAMEL 当前版本支持的模型环境变量。
"""

from __future__ import annotations

BOOK_TOPIC = "面向本科生的智能体框架开发实践"


def main() -> None:
    print("CAMEL 角色扮演实验模板")
    print("Assistant role: 专业教材作者")
    print("User role: 严格课程编辑")
    print("Task:", f"共同完成《{BOOK_TOPIC}》的目录、样章和修改建议。")
    print("建议先运行 labs/camel_style_book_writing.py，再按当前 CAMEL 官方文档替换为真实 ChatAgent。")


if __name__ == "__main__":
    main()
