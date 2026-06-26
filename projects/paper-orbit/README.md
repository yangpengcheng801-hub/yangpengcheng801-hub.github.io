# Paper Orbit

论文阅读 RAG 项目。上传 PDF 或 Word 后，后端解析文档、切分文本、写入向量库；提问时先检索相关片段，再生成回答和来源。

## 技术栈

- Backend: Python, FastAPI, Pydantic
- RAG: LangChain, ChromaDB, sentence-transformers
- Parsing: PyMuPDF, pymupdf4llm, python-docx
- Frontend: React, TypeScript, Vite

## 流程

```text
PDF / Word
  -> parse
  -> chunk
  -> embedding
  -> ChromaDB
  -> retrieve
  -> answer with sources
```

## 目录

```text
paper-orbit/
├── backend/
│   ├── app/api/
│   ├── app/core/
│   ├── app/parsers/
│   └── app/schemas/
├── frontend/
│   └── src/
└── scripts/
```

## 运行

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

## 说明

公开仓库没有提交 `.env`、真实 API Key、上传论文、向量库数据库、`node_modules` 和虚拟环境。完整运行需要自己配置模型 API Key 和 embedding 模型。
