# Agent Framework Lab | 大模型智能体框架实践

这是一个面向大模型 Agent 框架学习的实验项目，用教学版代码复现 AutoGen、AgentScope、CAMEL、LangGraph 等框架的核心思想。

## 项目目标

通过不依赖 API Key 的教学版实验，理解多智能体协作中的几个关键机制：

- 角色分工与轮询对话
- 消息中心与结构化行动
- 任务分解与角色扮演
- 图式工作流、节点、边和条件跳转
- 反思循环与终止条件

## 目录结构

```text
agent-framework-lab/
├── labs/                  # 无 API Key 教学版实验
├── framework_templates/   # 真实框架模板，需自行配置 API Key
├── scripts/               # 环境检查与批量运行脚本
├── EXPERIMENT_GUIDE.md
└── SOURCE_NOTES.md
```

## 快速运行

```powershell
cd projects/agent-framework-lab
python scripts/check_env.py
python scripts/lab0_run_all_minimal.py
```

## 包含实验

- `autogen_style_software_team.py`: 软件开发团队协作模拟。
- `agentscope_style_werewolf.py`: 多角色消息中心与行动模拟。
- `camel_style_book_writing.py`: 角色扮演和任务分解写作流程。
- `langgraph_style_dialogue_workflow.py`: 图式对话工作流。
- `streamlit_bitcoin_app.py`: 简单数据应用生成与展示。

## 面试可讲亮点

- 不只会调用聊天接口，也理解 Agent 应用中的状态、角色、消息和工作流。
- 能区分“教学版复现机制”和“真实框架模板”的边界。
- 可迁移到大模型应用中的工具调用、任务编排和多步骤处理。

## 公开仓库说明

本目录已排除 `.env`、运行输出、实验报告二进制文件和本地缓存。真实框架模板只读取环境变量，不包含任何密钥。
