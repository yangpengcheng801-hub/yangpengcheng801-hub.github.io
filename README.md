# 杨鹏程 | 大模型应用开发实习作品集

在线作品集：[https://yangpengcheng801-hub.github.io/](https://yangpengcheng801-hub.github.io/)

这个仓库用于给面试官快速查看我的大模型应用开发相关项目。重点不是堆文件，而是把能体现岗位匹配度的项目整理成可阅读、可运行、可追问的形式。

## 求职定位

- 目标岗位：大模型应用开发实习 / AI 应用工程 / Python 后端
- 学校专业：武汉轻工大学，人工智能专业本科在读
- 重点能力：RAG、FastAPI、LangChain、ChromaDB、文档解析、向量检索、Prompt Engineering、数据处理
- 可持续实习：3 个月以上

## 推荐面试官查看顺序

### 1. Paper Orbit | 论文智能阅读 RAG 系统

目录：[`projects/paper-orbit`](./projects/paper-orbit/)

主推项目。它覆盖大模型应用实习中最常见的工程链路：

```text
PDF / Word 上传
  -> 文档解析
  -> 文本切分
  -> Embedding
  -> ChromaDB 向量存储
  -> 召回 + 重排
  -> Prompt 组装
  -> LLM 生成答案
  -> 返回答案和引用来源
```

可讲亮点：

- 用 RAG 替代整篇论文直接输入，降低 token 成本和上下文噪声。
- 后端用 FastAPI 组织文档上传、解析、检索和问答接口。
- 通过引用溯源让答案能够回到原文核验，降低幻觉风险。
- 可继续优化 chunk 策略、混合检索、rerank、缓存和评估集。

### 2. PaperPilot Lite | 本地优先论文阅读助手

目录：[`projects/paperpilot-lite`](./projects/paperpilot-lite/)

轻量原型项目，展示从“本地解析 + 检索 + 证据约束问答”到 Paper Orbit 工程化版本的迭代过程。

### 3. Agent Framework Lab | 大模型智能体框架实践

目录：[`projects/agent-framework-lab`](./projects/agent-framework-lab/)

用于理解 AutoGen、AgentScope、CAMEL、LangGraph 等框架背后的角色、消息、状态、图式工作流和反思循环。

### 4. CET-4 单词学习应用

在线体验：[https://yangpengcheng801-hub.github.io/cet4-app/](https://yangpengcheng801-hub.github.io/cet4-app/)

展示 Web/PWA、静态部署和移动端体验。

## 仓库结构

```text
.
├── index.html                  # 个人作品集首页
├── projects/
│   ├── paper-orbit/            # 主推 RAG 项目
│   ├── paperpilot-lite/        # 轻量论文助手原型
│   └── agent-framework-lab/    # Agent 框架实践
├── cet4-app/                   # CET-4 单词学习 Web 应用
├── img/                        # 静态图片资源
└── README.md
```

## 公开安全处理

已排除以下内容：

- 真实 API Key、`.env`
- 本地上传论文、向量库数据库、运行时缓存
- `node_modules`、虚拟环境、IDE 配置和临时文件
- 不适合公开展示的本地作业、压缩包和无关素材

## 联系方式

- Email: 1756325284@qq.com
- GitHub: [yangpengcheng801-hub](https://github.com/yangpengcheng801-hub)
