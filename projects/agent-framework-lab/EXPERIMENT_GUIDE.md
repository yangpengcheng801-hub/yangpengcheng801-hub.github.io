# 第六章“框架开发实践”实验指导手册

## 一、实验目标

通过 4 个实验理解智能体框架为什么必要，以及框架如何把“模型调用、角色设定、工具调用、状态管理、工作流控制、日志追踪”这些通用能力标准化。

完成本实验后，学生应能够：

1. 解释从手写智能体到框架开发的差异；
2. 理解 AutoGen 的“对话驱动协作”；
3. 理解 AgentScope 的“消息驱动多智能体系统”；
4. 理解 CAMEL 的“角色扮演式任务协作”；
5. 理解 LangGraph 的“图式工作流与条件跳转”；
6. 能够修改角色、任务、终止条件，并观察运行结果变化。

---

## 二、实验环境

### 1. 基础环境

推荐：

```bash
python --version
# 建议 Python 3.10+
```

### 2. 创建虚拟环境

Windows PowerShell：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

macOS/Linux：

```bash
python -m venv .venv
source .venv/bin/activate
```

### 3. 检查环境

```bash
python scripts/check_env.py
```

若输出 Python 版本和项目目录，即说明基础环境可用。

---

## 三、实验一：AutoGen 风格的软件开发团队

### 1. 实验目的

理解多智能体团队如何通过“角色分工 + 顺序对话 + 终止条件”完成一个软件开发任务。

### 2. 运行命令

```bash
python labs/autogen_style_software_team.py
```

### 3. 观察结果

打开输出文件：

```bash
outputs/autogen_style_transcript.md
outputs/generated_bitcoin_app.py
```

### 4. 关键观察点

- ProductManager 是否先把需求拆成模块？
- Engineer 是否根据需求生成实现方案？
- CodeReviewer 是否提出审查意见？
- UserProxy 是否给出验收结论？
- `TERMINATE` 是否作为任务终止标志？

### 5. 修改任务

打开 `labs/autogen_style_software_team.py`，修改：

```python
TASK = "开发一个天气查询应用"
```

再次运行，观察团队输出是否随任务变化。

---

## 四、实验二：AgentScope 风格的三国狼人杀

### 1. 实验目的

理解消息中心、角色状态、结构化输出在复杂多智能体系统中的作用。

### 2. 运行命令

```bash
python labs/agentscope_style_werewolf.py
```

### 3. 观察结果

```bash
outputs/agentscope_style_werewolf_log.json
```

### 4. 关键观察点

- 每名玩家是否同时具有“游戏身份”和“三国人物人格”？
- 夜晚阶段和白天阶段是否有不同消息流？
- 投票是否以结构化字段保存，例如 `vote`、`reason`、`confidence`？
- 游戏状态是否随死亡、投票发生变化？

### 5. 修改实验

修改玩家列表或角色分配，观察结果变化。

---

## 五、实验三：CAMEL 风格的数字图书写作

### 1. 实验目的

理解两个或多个角色如何通过角色扮演完成内容生产任务。

### 2. 运行命令

```bash
python labs/camel_style_book_writing.py
```

### 3. 观察结果

```bash
outputs/camel_style_digital_book.md
```

### 4. 关键观察点

- Writer 是否负责生成内容？
- Editor 是否负责评价、修改建议和结构优化？
- 写作任务是否被拆解为选题、目录、样章、修改意见？

### 5. 修改实验

修改主题：

```python
BOOK_TOPIC = "面向医学生的智能体入门"
```

再次运行，观察输出风格变化。

---

## 六、实验四：LangGraph 风格的图式对话工作流

### 1. 实验目的

理解图式工作流中的节点、边、条件跳转和反思循环。

### 2. 运行命令

```bash
python labs/langgraph_style_dialogue_workflow.py
```

### 3. 观察结果

```bash
outputs/langgraph_style_trace.json
outputs/langgraph_style_graph.mmd
```

可以把 `.mmd` 文件内容复制到 Mermaid Live Editor 或支持 Mermaid 的 Markdown 编辑器中查看流程图。

### 4. 关键观察点

- `classify` 节点是否判断用户意图？
- `retrieve` 节点是否提供知识上下文？
- `answer` 节点是否生成回答？
- `reflect` 节点是否决定是否需要重写？
- 当质量不足时，是否进入 `rewrite` 后再回到 `answer`？

---

## 七、综合实验：一次运行全部教学案例

```bash
python scripts/lab0_run_all_minimal.py
```

运行后检查：

```bash
ls outputs
```

Windows PowerShell：

```powershell
Get-ChildItem outputs
```

---

## 八、进阶实验：切换到真实框架

### 1. 配置 API Key

复制环境变量文件：

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

然后填写：

```text
LLM_API_KEY=你的 OpenAI 兼容 API Key
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL_ID=gpt-4o-mini
DASHSCOPE_API_KEY=你的 DashScope API Key
```

### 2. 安装真实框架依赖

```bash
pip install -r requirements_frameworks.txt
```

### 3. 运行模板

```bash
python framework_templates/autogen_software_team_template.py
python framework_templates/langgraph_dialogue_template.py
```

AgentScope 和 CAMEL 的 API 版本变化较快，如果运行时报导入错误，优先检查框架版本与官方文档。

---

## 九、实验报告建议格式

1. 实验名称；
2. 实验环境；
3. 核心原理；
4. 运行截图或日志摘要；
5. 修改了哪些参数；
6. 修改后输出有什么变化；
7. 对该框架适用场景的判断。

---

## 十、评分建议

| 项目 | 分值 | 说明 |
|---|---:|---|
| 环境配置成功 | 10 | 能运行 `check_env.py` |
| 四个教学案例运行成功 | 30 | 每个案例 7.5 分 |
| 能解释四类框架机制 | 20 | 对话、消息、角色扮演、图工作流 |
| 能完成一次自定义修改 | 20 | 修改任务、角色或流程并分析变化 |
| 实验报告完整性 | 20 | 有日志、有截图、有分析 |
