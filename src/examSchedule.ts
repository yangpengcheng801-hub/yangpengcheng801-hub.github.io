/** 10 天四级高频冲刺日程 */

export const EXAM_DATE_KEY = 'cet4_exam_date_v1'
export const HF_TOTAL_HINT = 972
export const SPRINT_DAYS = 10

export type SchedulePhase = 'learn' | 'review' | 'exam'

export type DayPlan = {
  day: number
  title: string
  wordFrom: number
  wordTo: number
  dailyNewWords: number
  cumulativeWords: number
  appAction: string
  extraTask: string
  phase: SchedulePhase
  minutes: string
}

export const TEN_DAY_PLAN: DayPlan[] = [
  {
    day: 1,
    title: '启动高频第 1 轮',
    wordFrom: 1,
    wordTo: 140,
    dailyNewWords: 140,
    cumulativeWords: 140,
    appAction: '高频冲刺 · 第 1 轮，新学 140 词；会的大批「标记已掌握」',
    extraTask: '听力 Section A 1 套',
    phase: 'learn',
    minutes: '2～2.5h',
  },
  {
    day: 2,
    title: '继续扫高频',
    wordFrom: 141,
    wordTo: 280,
    dailyNewWords: 140,
    cumulativeWords: 280,
    appAction: '学习页推进第 1 轮；错词页刷 1 组例句',
    extraTask: '阅读精读 2 篇',
    phase: 'learn',
    minutes: '2～2.5h',
  },
  {
    day: 3,
    title: '巩固 + 提速',
    wordFrom: 281,
    wordTo: 420,
    dailyNewWords: 140,
    cumulativeWords: 420,
    appAction: '保持每日 140 新词；复习页过已掌握词例句',
    extraTask: '翻译练习 5 句',
    phase: 'learn',
    minutes: '2～2.5h',
  },
  {
    day: 4,
    title: '半程检查',
    wordFrom: 421,
    wordTo: 560,
    dailyNewWords: 140,
    cumulativeWords: 560,
    appAction: '学习 + 错词例句；进度应 ≥560 已掌握',
    extraTask: '作文背 1 套开头结尾模板',
    phase: 'learn',
    minutes: '2～2.5h',
  },
  {
    day: 5,
    title: '持续推进',
    wordFrom: 561,
    wordTo: 700,
    dailyNewWords: 140,
    cumulativeWords: 700,
    appAction: '第 1 轮继续；优先清错词本',
    extraTask: '完整听力 25 分钟',
    phase: 'learn',
    minutes: '2～2.5h',
  },
  {
    day: 6,
    title: '冲刺前半段',
    wordFrom: 701,
    wordTo: 840,
    dailyNewWords: 140,
    cumulativeWords: 840,
    appAction: '学习页 + 复习页各 30 分钟',
    extraTask: '阅读限时 40 分钟',
    phase: 'learn',
    minutes: '2.5h',
  },
  {
    day: 7,
    title: '第 1 轮收官',
    wordFrom: 841,
    wordTo: 972,
    dailyNewWords: 132,
    cumulativeWords: 972,
    appAction: '学完剩余高频词 → 进入第 2 轮；错词全刷',
    extraTask: '错词页 + 复习页例句过一遍',
    phase: 'learn',
    minutes: '2.5h',
  },
  {
    day: 8,
    title: '第 2 轮复习',
    wordFrom: 0,
    wordTo: 0,
    dailyNewWords: 0,
    cumulativeWords: 972,
    appAction: '只学未掌握词（App 第 2 轮）；错词优先',
    extraTask: '近 3 年真题选词填空',
    phase: 'review',
    minutes: '2h',
  },
  {
    day: 9,
    title: '第 3 轮 + 模考',
    wordFrom: 0,
    wordTo: 0,
    dailyNewWords: 0,
    cumulativeWords: 972,
    appAction: '第 3 轮未掌握词；复习/错词例句',
    extraTask: '完整模拟 1 套（除作文）',
    phase: 'review',
    minutes: '2.5h',
  },
  {
    day: 10,
    title: '考前巩固',
    wordFrom: 0,
    wordTo: 0,
    dailyNewWords: 0,
    cumulativeWords: 972,
    appAction: '只过错词 + 复习例句；不再学新词',
    extraTask: '看作文模板；早睡',
    phase: 'exam',
    minutes: '1.5h',
  },
]

export function defaultExamDate(): string {
  const d = new Date()
  d.setDate(d.getDate() + SPRINT_DAYS)
  return toDateInputValue(d)
}

export function toDateInputValue(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntilExam(examDateStr: string): number {
  const today = startOfDay(new Date())
  const exam = startOfDay(parseLocalDate(examDateStr))
  return Math.round((exam.getTime() - today.getTime()) / 86400000)
}

export function getCurrentPlanDay(examDateStr: string): number {
  const left = daysUntilExam(examDateStr)
  const day = SPRINT_DAYS - left
  if (left < 0) return SPRINT_DAYS
  return Math.max(1, Math.min(SPRINT_DAYS, day))
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export type DayStatus = 'done' | 'current' | 'upcoming' | 'missed'

export function getDayStatus(
  planDay: number,
  currentPlanDay: number,
  hfMastered: number,
  plan: DayPlan,
): DayStatus {
  if (planDay < currentPlanDay) {
    if (plan.phase === 'learn' && hfMastered < plan.cumulativeWords) return 'missed'
    return 'done'
  }
  if (planDay === currentPlanDay) return 'current'
  return 'upcoming'
}

export function isDayGoalMet(plan: DayPlan, hfMastered: number, currentPlanDay: number): boolean {
  if (plan.day < currentPlanDay) {
    return plan.phase !== 'learn' || hfMastered >= plan.cumulativeWords
  }
  if (plan.phase === 'learn') return hfMastered >= plan.cumulativeWords
  if (plan.phase === 'review') return hfMastered >= plan.cumulativeWords * 0.85
  return hfMastered >= plan.cumulativeWords * 0.9
}

export function formatExamDateLabel(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}
