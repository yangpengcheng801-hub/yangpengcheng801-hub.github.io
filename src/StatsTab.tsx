import { useEffect, useState } from 'react'
import ScheduleTab from './ScheduleTab'
import {
  cancelDailyReminder,
  getReminderEnabled,
  getReminderTime,
  scheduleDailyReminder,
  setReminderEnabled,
  setReminderTime,
} from './reminders'
import { getDueSrsCount } from './spacedReview'
import { getStatsSummary } from './studyStats'
import type { ScheduleContext } from './scheduleAi'

export default function StatsTab({
  examDate,
  onExamDateChange,
  scheduleCtx,
  apiKey,
  onGoLearn,
  onGoReview,
  onGoWrong,
}: {
  examDate: string
  onExamDateChange: (d: string) => void
  scheduleCtx: ScheduleContext
  apiKey: string
  onGoLearn: () => void
  onGoReview: () => void
  onGoWrong: () => void
}) {
  const [summary, setSummary] = useState(getStatsSummary)
  const [dueSrs, setDueSrs] = useState(getDueSrsCount)
  const [reminderOn, setReminderOn] = useState(getReminderEnabled)
  const time = getReminderTime()
  const [hour, setHour] = useState(time.hour)
  const [minute, setMinute] = useState(time.minute)
  const [reminderMsg, setReminderMsg] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)

  useEffect(() => {
    const refresh = () => {
      setSummary(getStatsSummary())
      setDueSrs(getDueSrsCount())
    }
    refresh()
    const t = setInterval(refresh, 30_000)
    return () => clearInterval(t)
  }, [])

  const handleReminderToggle = async () => {
    const next = !reminderOn
    setReminderOn(next)
    setReminderEnabled(next)
    if (!next) {
      await cancelDailyReminder()
      setReminderMsg('已关闭每日提醒')
      return
    }
    setReminderTime(hour, minute)
    const msg = await scheduleDailyReminder()
    setReminderMsg(msg)
  }

  const handleSaveTime = async () => {
    setReminderTime(hour, minute)
    if (!reminderOn) {
      setReminderMsg('已保存时间；开启开关后生效')
      return
    }
    const msg = await scheduleDailyReminder()
    setReminderMsg(msg)
  }

  const maxBar = Math.max(1, ...summary.last7.map((d) => d.total))

  if (showSchedule) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setShowSchedule(false)}
          className="mb-3 text-sm text-indigo-600"
        >
          ← 返回数据看板
        </button>
        <ScheduleTab
          examDate={examDate}
          onExamDateChange={onExamDateChange}
          hfMastered={scheduleCtx.hfMastered}
          hfTotal={scheduleCtx.hfTotal}
          hfWrong={scheduleCtx.hfWrong}
          currentRound={scheduleCtx.currentRound}
          apiKey={apiKey}
          onGoLearn={onGoLearn}
          onGoReview={onGoReview}
          onGoWrong={onGoWrong}
        />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="app-card p-4 text-center">
          <p className="text-2xl font-bold text-indigo-600">{summary.streak}</p>
          <p className="mt-1 text-xs text-slate-500">连续打卡（天）</p>
        </div>
        <div className="app-card p-4 text-center">
          <p className="text-2xl font-bold text-emerald-600">{summary.accuracy}%</p>
          <p className="mt-1 text-xs text-slate-500">本周正确率</p>
        </div>
        <div className="app-card p-4 text-center">
          <p className="text-2xl font-bold text-slate-800">{summary.today.correct}</p>
          <p className="mt-1 text-xs text-slate-500">今日答对</p>
        </div>
        <div className="app-card p-4 text-center">
          <p className="text-2xl font-bold text-orange-500">{dueSrs}</p>
          <p className="mt-1 text-xs text-slate-500">错词待复习</p>
        </div>
      </div>

      <div className="app-card p-4">
        <p className="mb-3 text-sm font-semibold text-slate-800">近 7 天学习量</p>
        <div className="flex h-24 items-end gap-1.5">
          {summary.last7.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
              <div
                className="w-full rounded-t-md bg-indigo-400"
                style={{ height: `${Math.max(8, (d.total / maxBar) * 72)}px` }}
                title={`${d.total}`}
              />
              <span className="text-[10px] text-slate-400">{d.date}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          累计学习 {summary.activeDays} 天 · 本周复习 {summary.week.reviewed} 次
        </p>
      </div>

      <div className="app-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">每日提醒</p>
          <button
            type="button"
            onClick={() => void handleReminderToggle()}
            className={`rounded-full px-3 py-1 text-xs font-medium card-press ${
              reminderOn ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {reminderOn ? '已开启' : '已关闭'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={23}
            value={hour}
            onChange={(e) => setHour(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
          />
          <span className="text-slate-400">:</span>
          <input
            type="number"
            min={0}
            max={59}
            value={minute}
            onChange={(e) => setMinute(Number(e.target.value))}
            className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-center text-sm"
          />
          <button
            type="button"
            onClick={() => void handleSaveTime()}
            className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-700 card-press"
          >
            保存
          </button>
        </div>
        {reminderMsg && (
          <p className="mt-2 text-xs text-indigo-600">{reminderMsg}</p>
        )}
        <p className="mt-2 text-[11px] text-slate-400">
          安装 APK 后可在设定时间推送「错词复习」提醒
        </p>
      </div>

      <button
        type="button"
        onClick={() => setShowSchedule(true)}
        className="app-card w-full p-4 text-left card-press"
      >
        <p className="text-sm font-semibold text-slate-800">备考日程 →</p>
        <p className="mt-1 text-xs text-slate-500">10 天冲刺计划与 AI 排课</p>
      </button>
    </div>
  )
}
