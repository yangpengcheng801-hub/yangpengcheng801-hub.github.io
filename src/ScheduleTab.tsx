import { useCallback, useEffect, useState } from 'react'
import {
  daysUntilExam,
  formatExamDateLabel,
  getCurrentPlanDay,
  getDayStatus,
  isDayGoalMet,
  SPRINT_DAYS,
  TEN_DAY_PLAN,
  type SchedulePhase,
} from './examSchedule'
import {
  generateDailySchedule,
  getTodayRecord,
  getTodayPreviewPlan,
  getYesterdayDateStr,
  listScheduleHistory,
  type AiDailyPlan,
  type ScheduleRecord,
} from './scheduleAi'

type ScheduleTabProps = {
  examDate: string
  onExamDateChange: (date: string) => void
  hfMastered: number
  hfTotal: number
  hfWrong: number
  currentRound: number
  apiKey: string
  onGoLearn: () => void
  onGoReview: () => void
  onGoWrong: () => void
}

function phaseLabel(phase: SchedulePhase) {
  if (phase === 'learn') return '新学'
  if (phase === 'review') return '复习'
  return '考前'
}

function phaseColor(phase: SchedulePhase) {
  if (phase === 'learn') return 'bg-indigo-100 text-indigo-700'
  if (phase === 'review') return 'bg-emerald-100 text-emerald-700'
  return 'bg-amber-100 text-amber-800'
}

function isAiPlanGoalMet(plan: AiDailyPlan, hfMastered: number): boolean {
  if (plan.phase === 'learn') return hfMastered >= plan.cumulativeTarget
  if (plan.phase === 'review') return hfMastered >= plan.cumulativeTarget * 0.85
  return hfMastered >= plan.cumulativeTarget * 0.9
}

function formatDateShort(dateStr: string): string {
  const [, m, d] = dateStr.split('-')
  return `${Number(m)}月${Number(d)}日`
}

export default function ScheduleTab({
  examDate,
  onExamDateChange,
  hfMastered,
  hfTotal,
  hfWrong,
  currentRound,
  apiKey,
  onGoLearn,
  onGoReview,
  onGoWrong,
}: ScheduleTabProps) {
  const daysLeft = daysUntilExam(examDate)
  const currentDay = getCurrentPlanDay(examDate)
  const ctx = {
    examDate,
    hfMastered,
    hfTotal,
    hfWrong,
    currentRound,
  }

  const [todayRecord, setTodayRecord] = useState<ScheduleRecord | null>(() => getTodayRecord())
  const [history, setHistory] = useState<ScheduleRecord[]>(() => listScheduleHistory())
  const [report, setReport] = useState('')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const todayPlan: AiDailyPlan = todayRecord?.plan ?? getTodayPreviewPlan(ctx)
  const todayMet = isAiPlanGoalMet(todayPlan, hfMastered)
  const hasGeneratedToday = todayRecord !== null

  const refreshStore = useCallback(() => {
    setTodayRecord(getTodayRecord())
    setHistory(listScheduleHistory())
  }, [])

  useEffect(() => {
    refreshStore()
  }, [refreshStore])

  const handleGenerate = async () => {
    setGenerating(true)
    setError('')
    try {
      const record = await generateDailySchedule(apiKey, report, ctx)
      setTodayRecord(record)
      setHistory(listScheduleHistory())
      setReport('')
    } catch {
      setError('生成失败，请稍后重试')
    } finally {
      setGenerating(false)
    }
  }

  const countdownText =
    daysLeft > 0
      ? `距考试还有 ${daysLeft} 天`
      : daysLeft === 0
        ? '今天考试，加油！'
        : `考试已过去 ${Math.abs(daysLeft)} 天`

  const showReviewButtons = todayPlan.phase !== 'learn' || currentDay >= 7

  return (
    <div className="space-y-3 pb-2">
      <div className="app-card schedule-hero p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-500">
              10 天冲刺日程
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">{countdownText}</h2>
            <p className="mt-1 text-xs text-slate-500">
              考试日期 {formatExamDateLabel(examDate)} · 今日第 {currentDay}/{SPRINT_DAYS} 天
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
              todayMet ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'
            }`}
          >
            {todayMet ? '今日达标' : '进行中'}
          </span>
        </div>
        <label className="block text-xs text-slate-500">
          考试日期
          <input
            type="date"
            value={examDate}
            onChange={(e) => onExamDateChange(e.target.value)}
            className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          />
        </label>
      </div>

      <div className="app-card border border-violet-100 bg-violet-50/40 p-4">
        <p className="mb-1 text-sm font-bold text-violet-800">每日汇报 · 生成今日任务</p>
        <p className="mb-3 text-xs leading-relaxed text-slate-500">
          汇报昨天（{formatDateShort(getYesterdayDateStr())}）任务的完成情况，AI 会根据你的进度制定今天的学习计划。
        </p>
        <textarea
          value={report}
          onChange={(e) => setReport(e.target.value)}
          placeholder="例如：昨天学了 120 个词，听力只做了半套，错词例句刷了一组…"
          rows={3}
          className="mb-3 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400"
        />
        {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="app-primary-btn w-full py-2.5 text-sm disabled:opacity-60"
        >
          {generating ? 'AI 正在制定…' : hasGeneratedToday ? '重新汇报并更新今日任务' : '汇报并生成今日任务'}
        </button>
        {!apiKey && (
          <p className="mt-2 text-[11px] text-amber-600">
            未配置 AI Key，将使用默认模板并根据汇报微调。在设置中配置后可获得个性化日程。
          </p>
        )}
      </div>

      <div className="app-card border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-violet-800">
            今日 · D{todayPlan.planDay} {todayPlan.title}
          </p>
          <div className="flex shrink-0 items-center gap-1.5">
            {hasGeneratedToday && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                {todayRecord?.source === 'ai' ? 'AI 定制' : '模板'}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${phaseColor(todayPlan.phase)}`}>
              {phaseLabel(todayPlan.phase)}
            </span>
          </div>
        </div>

        {todayPlan.feedback && (
          <div className="mb-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {todayPlan.feedback}
          </div>
        )}

        {todayPlan.phase === 'learn' && todayPlan.cumulativeTarget > 0 && (
          <p className="mb-2 text-xs text-slate-600">
            高频词进度 {hfMastered}/{hfTotal}（目标累计 ≥{todayPlan.cumulativeTarget}）
          </p>
        )}
        {todayPlan.phase !== 'learn' && (
          <p className="mb-2 text-xs text-slate-600">
            已掌握 {hfMastered}/{hfTotal} · 当前第 {currentRound} 轮 · 错词 {hfWrong}
          </p>
        )}

        <ul className="mb-3 space-y-1.5 text-xs text-slate-700">
          {todayPlan.appTasks.map((task, i) => (
            <li key={`app-${i}`} className="flex gap-2">
              <span className="shrink-0 font-medium text-violet-500">App</span>
              <span>{task}</span>
            </li>
          ))}
          {todayPlan.extraTasks.map((task, i) => (
            <li key={`extra-${i}`} className="flex gap-2">
              <span className="shrink-0 font-medium text-violet-500">加练</span>
              <span>{task}</span>
            </li>
          ))}
          <li className="flex gap-2">
            <span className="shrink-0 font-medium text-violet-500">时长</span>
            <span>{todayPlan.minutes}</span>
          </li>
          {todayPlan.wordTarget > 0 && (
            <li className="flex gap-2">
              <span className="shrink-0 font-medium text-violet-500">词量</span>
              <span>今日建议 {todayPlan.wordTarget} 词</span>
            </li>
          )}
        </ul>

        {todayPlan.encouragement && (
          <p className="mb-3 text-xs italic text-violet-600">{todayPlan.encouragement}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onGoLearn} className="app-primary-btn flex-1 py-2.5 text-sm">
            去学习
          </button>
          {showReviewButtons && (
            <>
              <button
                type="button"
                onClick={onGoReview}
                className="rounded-xl bg-emerald-500 px-3 py-2.5 text-xs font-medium text-white card-press"
              >
                复习
              </button>
              <button
                type="button"
                onClick={onGoWrong}
                className="rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-medium text-white card-press"
              >
                错词
              </button>
            </>
          )}
        </div>
      </div>

      {history.length > 0 && (
        <div className="app-card p-3">
          <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
            历史日程
          </p>
          <div className="space-y-2">
            {history.map((rec) => (
              <div key={rec.date} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-700">
                    {formatDateShort(rec.date)} · D{rec.plan.planDay} {rec.plan.title}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {rec.source === 'ai' ? 'AI' : '模板'}
                  </span>
                </div>
                {rec.userReport && (
                  <p className="mt-1 text-[11px] text-slate-500">汇报：{rec.userReport}</p>
                )}
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  {rec.plan.appTasks[0]}
                  {rec.plan.extraTasks[0] ? ` · ${rec.plan.extraTasks[0]}` : ''}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="app-card p-3">
        <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          参考 · 10 天模板
        </p>
        <div className="space-y-2">
          {TEN_DAY_PLAN.map((plan) => {
            const status = getDayStatus(plan.day, currentDay, hfMastered, plan)
            const goalMet = isDayGoalMet(plan, hfMastered, currentDay)
            return (
              <div
                key={plan.day}
                className={[
                  'schedule-day rounded-2xl border px-3 py-3 transition-colors',
                  status === 'current'
                    ? 'schedule-day--current border-violet-300 bg-violet-50/80'
                    : status === 'done'
                      ? 'schedule-day--done border-emerald-200 bg-emerald-50/50'
                      : status === 'missed'
                        ? 'schedule-day--missed border-orange-200 bg-orange-50/40'
                        : 'border-slate-100 bg-white',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-800">D{plan.day}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${phaseColor(plan.phase)}`}>
                        {phaseLabel(plan.phase)}
                      </span>
                      {status === 'done' && goalMet && (
                        <span className="text-[10px] text-emerald-600">✓</span>
                      )}
                      {status === 'missed' && (
                        <span className="text-[10px] text-orange-600">待补</span>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-slate-800">{plan.title}</p>
                    {plan.phase === 'learn' && (
                      <p className="mt-1 text-[11px] text-slate-500">
                        词 {plan.wordFrom}～{plan.wordTo} · 累计 ≥{plan.cumulativeWords}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{plan.extraTask}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
