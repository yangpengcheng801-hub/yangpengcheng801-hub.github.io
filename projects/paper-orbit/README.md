# Paper Orbit | 论文智能阅读 RAG 系统

Paper Orbit 是一个面向论文阅读场景的大模型应用项目，核心目标是把论文文档解析、向量检索、重排、引用溯源和问答生成串成完整 RAG 链路。

## 为什么做

直接把整篇论文交给大模型会遇到几个问题：

- 长文 token 成本高，上下文噪声大。
- 回答不一定能对应到原文证据，容易出现幻觉。
- 多次追问时缺少结构化的论文目录、章节和片段索引。

Paper Orbit 的思路是先把论文处理成可检索的知识片段，再让模型基于召回内容回答，并返回引用来源。

## 技术栈

- Backend: Python, FastAPI, Pydantic
- RAG: LangChain, ChromaDB, sentence-transformers
- Parsing: PyMuPDF, pymupdf4llm, python-docx
- Frontend: React, TypeScript, Vite, Tailwind CSS
- LLM: OpenAI-compatible API, configurable by `.env`

## 核心链路

```text
PDF / Word 上传
  -> 文档解析
  -> 章节与文本切分
  -> Embedding
  -> ChromaDB 向量存储
  -> 召回 + 可选重排
  -> Prompt 组装
  -> LLM 生成答案
  -> 返回答案和引用来源
```

## 目录结构

```text
paper-orbit/
├── backend/
│   ├── app/api/          # FastAPI 路由
│   ├── app/core/         # RAG、检索、向量库、知识抽取
│   ├── app/parsers/      # PDF / Word 解析
│   ├── app/schemas/      # 请求与响应模型
│   └── data/             # 运行时数据目录，仓库只保留 .gitkeep
├── frontend/
│   └── src/              # React 前端
└── scripts/              # 安装、启动、打包脚本
```

## 快速运行

```powershell
cd projects/paper-orbit
npm install
npm run setup
copy backend\.env.example backend\.env
# 编辑 backend\.env，填写自己的 LLM_API_KEY
npm run dev
```

默认端口：

- Backend: `http://127.0.0.1:8000`
- Frontend: `http://127.0.0.1:5173`

## 面试可讲亮点

- 用 RAG 替代长文直接输入，降低 token 成本和无关上下文干扰。
- 用 FastAPI 拆分文档上传、解析、检索、问答接口，方便前后端解耦。
- 保留引用来源，让回答可以回到原文核验。
- 支持 PDF 和 Word 两类文档，体现文档智能应用中的数据预处理能力。
- 可继续优化混合检索、rerank、chunk size/overlap、缓存和评估集。

## 公开仓库说明

本目录是公开展示版，已排除：

- `.env` 和真实 API Key
- 本地上传论文
- ChromaDB 运行时数据库
- `node_modules`、虚拟环境和缓存文件
