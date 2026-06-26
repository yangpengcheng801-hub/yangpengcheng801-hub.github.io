# PaperPilot Lite

轻量论文阅读助手原型。这个项目主要用来验证本地解析、摘要、证据检索和问答流程。

## 功能

- 支持 PDF / TXT / Markdown。
- 抽取摘要、关键词、方法、结果和局限。
- 问答时返回相关证据片段。
- 可以不配置模型 API，先跑本地分析流程。

## 运行

```powershell
cd projects/paperpilot-lite
python -m pip install -r requirements.txt
python app.py
```

打开：

```text
http://127.0.0.1:8765
```

## 说明

目录里保留了源码、测试、示例和截图；没有提交真实密钥和本地缓存。
