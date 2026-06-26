# 杨鹏程的项目主页

在线地址：[https://yangpengcheng801-hub.github.io/](https://yangpengcheng801-hub.github.io/)

这里主要整理我最近做的 AI 应用相关项目，方向集中在论文阅读、文档解析、RAG、FastAPI 后端和 Agent 工作流练习。仓库里的项目尽量保留源码、运行命令和公开版本说明，方便直接查看。

## 项目

| 项目 | 内容 | 技术 | 入口 |
| --- | --- | --- | --- |
| Paper Orbit | 论文阅读 RAG 系统，包含文档解析、向量检索、问答和来源返回 | FastAPI, LangChain, ChromaDB, React, TypeScript | [项目页](https://yangpengcheng801-hub.github.io/projects/paper-orbit/) / [`projects/paper-orbit`](./projects/paper-orbit/) |
| PaperPilot Lite | 轻量论文阅读助手原型，支持本地解析、摘要、证据检索和笔记导出 | Python, local HTTP server, Markdown export | [项目页](https://yangpengcheng801-hub.github.io/projects/paperpilot-lite/) / [`projects/paperpilot-lite`](./projects/paperpilot-lite/) |
| Agent Framework Lab | 智能体框架练习，关注角色、消息、状态和图式工作流 | Python, AutoGen style, CAMEL style, LangGraph style | [项目页](https://yangpengcheng801-hub.github.io/projects/agent-framework-lab/) / [`projects/agent-framework-lab`](./projects/agent-framework-lab/) |

## 本地运行

每个项目都有自己的 README。可以先从轻量项目开始跑：

```powershell
cd projects/paperpilot-lite
python -m pip install -r requirements.txt
python app.py
```

Paper Orbit 是完整前后端项目，需要先配置模型 API Key 和 embedding 模型：

```powershell
cd projects/paper-orbit
npm install
npm run setup
copy backend\.env.example backend\.env
npm run dev
```

## 公开版本说明

公开仓库没有提交 `.env`、真实 API Key、上传论文、向量库数据、虚拟环境、依赖缓存和运行输出。需要完整运行时，请按各项目的 `.env.example` 自己配置本地环境。

## 联系

- Email: 1756325284@qq.com
- GitHub: [yangpengcheng801-hub](https://github.com/yangpengcheng801-hub)
