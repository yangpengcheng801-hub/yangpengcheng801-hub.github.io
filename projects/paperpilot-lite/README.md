# PaperPilot Lite | 本地优先论文阅读助手

PaperPilot Lite 是一个更轻量的论文阅读助手原型，重点展示文档解析、结构化摘要、证据约束问答和多角色分析思路。

## 项目特点

- 支持 PDF / TXT / Markdown 文档输入。
- 自动抽取摘要、关键词、方法、实验结果、贡献和局限。
- 通过本地检索片段约束问答，返回原文段落编号。
- 可选接入大模型增强表达，但本地模式也能完整演示。
- 包含单元测试、benchmark 和前端静态页面。

## 技术栈

- Python 标准库轻量实现
- Flask 风格单文件 Web 服务
- 本地文档解析与检索
- 可选 OpenAI-compatible / DashScope 接口

## 运行方式

```powershell
cd projects/paperpilot-lite
python -m pip install -r requirements.txt
python app.py
```

浏览器访问：

```text
http://127.0.0.1:8765
```

## 面试可讲亮点

- 这是 Paper Orbit 之前的轻量验证版本，体现从原型到工程化项目的迭代过程。
- 先实现本地可用的解析、检索、问答闭环，再接入大模型增强表达。
- 对大模型输出保持证据约束，强调“回答要能回到原文”。

## 公开仓库说明

本目录保留源码、测试、示例与截图，排除了真实密钥、缓存和无关构建产物。
