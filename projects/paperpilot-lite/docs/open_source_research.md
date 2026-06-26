# GitHub 论文阅读智能体调研与 PaperPilot 取舍

核验日期：2026-06-21。Star 数会随时间变化；下列数字仅记录核验时快照。

| 项目 | 核验情况 | 核心定位 | PaperPilot 借鉴点 |
|---|---:|---|---|
| [Paper2Agent](https://github.com/jmiao24/Paper2Agent) | 可访问，约 2.2k Star，MIT | 将论文配套代码/教程包装为可执行 MCP 工具 | 明确 Agent 分工与可调用工具思想 |
| [Paper Circle](https://github.com/MAXNORM8650/papercircle) | 可访问，约 94 Star，MIT | 论文发现、谱系、Mind Graph 与 review agents | 概念共现图和 Critic Agent |
| [OpenChatPaper](https://github.com/liuyixin-louis/OpenChatPaper) | 可访问，约 177 Star，BSD-2-Clause | GROBID + embedding 检索 + 动态上下文的论文对话 | 先定位相关段落，再组织回答 |
| [papreadr](https://github.com/michellefxl/papreadr) | 可访问，约 7 Star | Rasa 论文聊天机器人，摘要、问答、图片与笔记 | 对话式入口和阅读笔记 |
| [Zoro](https://github.com/ruihanglix/zoro) | 可访问，约 36 Star，AGPL | 本地优先文献管理、双语阅读、Agent、MCP | 本地优先与隐私意识 |
| [literature-assistant](https://github.com/liyupi/literature-assistant) | 可访问，约 152 Star | Spring/Vue 文献管理与 AI 阅读导引 | 面向学生的 Web 工作流 |
| [paper_pilot](https://github.com/shenmingig/paper_pilot) | 可访问，约 1 Star | 每日论文抓取、长期记忆、知识图谱 | 个性化跟踪可作为后续扩展 |
| [papermage](https://github.com/allenai/papermage) | 可访问，约 797 Star，Apache-2.0 | 丰富的 PDF 结构化表示；仓库提示维护状态 | 未来增强版面、图表和公式抽取 |

## 核验中发现的偏差

- Paper2Agent 核验时约 2.2k Star，并非材料中所述 12k+。
- `nekoneko083/Paper-Lens-Codex`、`openclaw/skills`、`Jurio0304/AI_Daily_Paper_Reader` 给出的地址核验时返回 404，因此未把其能力作为事实写入设计依据。
- DeepXiv、PaperCompanion、Paper Burner X 缺少可唯一确认的仓库地址，本次不对仓库能力作强结论。

## 本项目的工程取舍

重型框架功能丰富，但部署依赖、外部服务和演示成本较高。PaperPilot 采用“本地确定性底座 + 可选 Qwen 增强”：解析、证据检索、概念图、评审和导出均可离线完成；配置百炼后，Qwen 只在已有抽取结果与证据范围内进行综合。接口失败时自动回退，不影响课堂演示。

百炼接入使用阿里云官方的 [OpenAI 兼容接口说明](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope)，默认模型为 `qwen-plus`，密钥仅从 `DASHSCOPE_API_KEY` 环境变量读取。
