import { chatWithModelFallback } from './aiChat'
import {
  getCurrentPlanDay,
  daysUntilExam,
  TEN_DAY_PLAN,
  toDateInputValue,
  type SchedulePhase,
} from './examSchedule'

export const SCHEDULE_STORE_KEY = 'cet4_schedule_v1'

export type AiDailyPlan = {
  date: string
  planDay: number
  title: string
  phase: SchedulePhase
  appTasks: string[]
  extraTasks: string[]
  minutes: string
  wordTarget: number
  cumulativeTarget: number
  encouragement: string
  feedback: string
}

export type ScheduleRecord = {
  date: string
  plan: AiDailyPlan
  userReport: string
  generatedAt: number
  source: 'ai' | 'template'
  aiModel?: string
}

export type ScheduleStore = {
  records: Record<string, ScheduleRecord>
}

export type ScheduleContext = {
  examDate: string
  hfMastered: number
  hfTotal: number
  hfWrong: number
  currentRound: number
}

const SYSTEM_PROMPT = `你是大学英语四级备考教练。用户每天会汇报「前一天任务完成情况」，你需要根据汇报和当前进度，制定「今天」的个性化学习任务。

原则：
1. 任务要具体、可执行，分 App 内任务（背单词 App：学习/复习/错词）和纸面/真题加练
2. 若昨日未完成，今日适当减量或补做，不要堆过多任务
3. 距考试越近，越侧重复习、错词、真题，减少新词
4. 高频词库约 972 词，10 天冲刺
5. 语气鼓励、简洁

严格输出 JSON，不要其他文字：
{
  "title": "今日主题，8字以内",
  "phase": "learn|review|exam",
  "appTasks": ["App任务1", "App任务2"],
  "extraTasks": ["加练任务1"],
  "minutes": "建议时长如 2h",
  "wordTarget": 数字（今日建议新学/复习词量，复习阶段可为0）,
  "cumulativeTarget": 数字（累计掌握目标）,
  "encouragement": "一句鼓励",
  "feedback": "针对用户汇报的反馈与今日调整理由，2～4句"
}`

export function loadScheduleStore(): ScheduleStore {
  try {
    const raw = localStorage.getItem(SCHEDULE_STORE_KEY)
    if (!raw) return { records: {} }
    const data = JSON.parse(raw) as ScheduleStore
    return { records: data.records ?? {} }
  } catch {
    return { records: {} }
  }
}

export function saveScheduleStore(store: ScheduleStore) {
  try {
    localStorage.setItem(SCHEDULE_STORE_KEY, JSON.stringify(store))
  } catch {
    /* ignore */
  }
}

export function getTodayDateStr(): string {
  return toDateInputValue(new Date())
}

export function getYesterdayDateStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return toDateInputValue(d)
}

function templateToAiPlan(date: string, planDay: number): AiDailyPlan {
  const t = TEN_DAY_PLAN[Math.min(planDay - 1, TEN_DAY_PLAN.length - 1)]
  return {
    date,
    planDay,
    title: t.title,
    phase: t.phase,
    appTasks: [t.appAction],
    extraTasks: [t.extraTask],
    minutes: t.minutes,
    wordTarget: t.dailyNewWords,
    cumulativeTarget: t.cumulativeWords,
    encouragement: '按节奏坚持，每天进步一点！',
    feedback: '已根据 10 天冲刺模板生成默认任务；填写汇报后可让 AI 个性化调整。',
  }
}

function adjustTemplateFromReport(plan: AiDailyPlan, report: string): AiDailyPlan {
  const incomplete = /没|未|少|只做|来不及|忘了|没时间|未完成/.test(report)
  const good = /完成|做完|达标|学了\d+|掌握/.test(report)
  if (incomplete && !good) {
    return {
      ...plan,
      wordTarget: Math.max(60, Math.floor(plan.wordTarget * 0.85)),
      feedback:
        '检测到你昨日部分任务未完成，今日已适当减量。优先完成 App 学习任务，加练可酌情压缩。',
      encouragement: '进度有波动很正常，今日稳扎稳打即可。',
    }
  }
  if (good && incomplete) {
    return {
      ...plan,
      feedback: '昨日完成了一部分，今日会补做未完成项并维持合理强度。',
    }
  }
  return plan
}

function parseAiPlan(raw: string, date: string, planDay: number): AiDailyPlan | null {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const p = JSON.parse(jsonMatch[0]) as {
      title?: string
      phase?: string
      appTasks?: string[]
      extraTasks?: string[]
      minutes?: string
      wordTarget?: number
      cumulativeTarget?: number
      encouragement?: string
      feedback?: string
    }
    if (!p.title || !Array.isArray(p.appTasks)) return null
    const phase = (['learn', 'review', 'exam'].includes(p.phase ?? '')
      ? p.phase
      : 'learn') as SchedulePhase
    return {
      date,
      planDay,
      title: String(p.title).slice(0, 20),
      phase,
      appTasks: p.appTasks.map(String).slice(0, 6),
      extraTasks: (p.extraTasks ?? []).map(String).slice(0, 4),
      minutes: String(p.minutes ?? '2h'),
      wordTarget: Number(p.wordTarget) || 0,
      cumulativeTarget: Number(p.cumulativeTarget) || 0,
      encouragement: String(p.encouragement ?? '加油！'),
      feedback: String(p.feedback ?? ''),
    }
  } catch {
    return null
  }
}

function buildUserPrompt(
  report: string,
  ctx: ScheduleContext,
  yesterdayPlan: AiDailyPlan | null,
): string {
  const planDay = getCurrentPlanDay(ctx.examDate)
  const daysLeft = daysUntilExam(ctx.examDate)
  const today = getTodayDateStr()

  return `【考试】${ctx.examDate}，还剩 ${daysLeft} 天，冲刺第 ${planDay}/10 天，今天是 ${today}

【App 当前数据】
- 高频已掌握：${ctx.hfMastered}/${ctx.hfTotal}
- 错词数：${ctx.hfWrong}
- 学习轮次：第 ${ctx.currentRound} 轮

【昨日布置的任务】
${
  yesterdayPlan
    ? `- 主题：${yesterdayPlan.title}
- App：${yesterdayPlan.appTasks.join('；')}
- 加练：${yesterdayPlan.extraTasks.join('；')}
- 词量目标：${yesterdayPlan.wordTarget}，累计目标 ${yesterdayPlan.cumulativeTarget}`
    : '（首日，无昨日任务，请按第 1 天冲刺节奏安排）'
}

【用户昨日完成情况汇报】
${report.trim() || '（用户未填写，请根据 App 数据推断并安排适中任务）'}

请制定「今天」的任务。`
}

export async function generateDailySchedule(
  apiKey: string,
  report: string,
  ctx: ScheduleContext,
): Promise<ScheduleRecord> {
  const today = getTodayDateStr()
  const planDay = getCurrentPlanDay(ctx.examDate)
  const store = loadScheduleStore()
  const yesterday = getYesterdayDateStr()
  const yesterdayRecord = store.records[yesterday]

  let plan: AiDailyPlan
  let source: 'ai' | 'template' = 'template'
  let aiModel: string | undefined

  if (apiKey) {
    try {
      const { content, model } = await chatWithModelFallback(
        apiKey,
        {
          temperature: 0.65,
          max_tokens: 800,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            {
              role: 'user',
              content: buildUserPrompt(report, ctx, yesterdayRecord?.plan ?? null),
            },
          ],
        },
        undefined,
        (raw) => parseAiPlan(raw, today, planDay) !== null,
      )
      const parsed = parseAiPlan(content, today, planDay)
      if (parsed) {
        plan = parsed
        source = 'ai'
        aiModel = model
      } else {
        throw new Error('AI 返回格式无效')
      }
    } catch {
      plan = templateToAiPlan(today, planDay)
      plan = adjustTemplateFromReport(plan, report)
      plan.feedback += '（AI 暂不可用，已用本地模板并参考你的汇报微调）'
    }
  } else {
    plan = templateToAiPlan(today, planDay)
    plan = adjustTemplateFromReport(plan, report)
    plan.feedback = '未配置 AI Key，已用默认模板。配置后可获得个性化日程。'
  }

  const record: ScheduleRecord = {
    date: today,
    plan,
    userReport: report.trim(),
    generatedAt: Date.now(),
    source,
    aiModel,
  }

  store.records[today] = record
  saveScheduleStore(store)
  return record
}

export function getTodayRecord(): ScheduleRecord | null {
  const store = loadScheduleStore()
  return store.records[getTodayDateStr()] ?? null
}

export function getTodayPreviewPlan(ctx: ScheduleContext): AiDailyPlan {
  const existing = getTodayRecord()
  if (existing) return existing.plan
  const today = getTodayDateStr()
  const planDay = getCurrentPlanDay(ctx.examDate)
  return templateToAiPlan(today, planDay)
}

export function listScheduleHistory(limit = 9): ScheduleRecord[] {
  const store = loadScheduleStore()
  const today = getTodayDateStr()
  return Object.values(store.records)
    .filter((r) => r.date !== today)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
}
