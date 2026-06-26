# 杨鹏程的项目主页

在线地址：[https://yangpengcheng801-hub.github.io/](https://yangpengcheng801-hub.github.io/)

这里主要整理我最近做的大模型应用相关项目，方向集中在论文阅读、文档解析、RAG、FastAPI 后端和 Agent 框架练习。

## 项目

### Paper Orbit

在线项目页：[https://yangpengcheng801-hub.github.io/projects/paper-orbit/](https://yangpengcheng801-hub.github.io/projects/paper-orbit/)

源码目录：[`projects/paper-orbit`](./projects/paper-orbit/)

论文阅读 RAG 系统。大致流程：

```text
PDF / Word 上传
  -> 文档解析
  -> 文本切分
  -> Embedding
  -> ChromaDB
  -> 检索相关片段
  -> 生成回答和来源
```

用到的技术：FastAPI、LangChain、ChromaDB、sentence-transformers、React、TypeScript。

### PaperPilot Lite

在线项目页：[https://yangpengcheng801-hub.github.io/projects/paperpilot-lite/](https://yangpengcheng801-hub.github.io/projects/paperpilot-lite/)

源码目录：[`projects/paperpilot-lite`](./projects/paperpilot-lite/)

更轻量的论文阅读助手原型，用来验证本地解析、摘要、证据检索和问答功能。

### Agent Framework Lab

在线项目页：[https://yangpengcheng801-hub.github.io/projects/agent-framework-lab/](https://yangpengcheng801-hub.github.io/projects/agent-framework-lab/)

源码目录：[`projects/agent-framework-lab`](./projects/agent-framework-lab/)

整理 AutoGen、AgentScope、CAMEL、LangGraph 这类框架背后的角色、消息、状态和工作流机制。

## 运行说明

GitHub Pages 上的首页和项目页可以直接查看。

`paperpilot-lite` 和 `agent-framework-lab` 可以按各自 README 在本地运行。`paper-orbit` 是完整的前后端项目，运行前需要自己配置模型 API Key 和 embedding 模型。公开仓库里没有提交 `.env`、真实密钥、上传论文、向量库数据库和依赖缓存。

## 联系

- Email: 1756325284@qq.com
- GitHub: [yangpengcheng801-hub](https://github.com/yangpengcheng801-hub)
