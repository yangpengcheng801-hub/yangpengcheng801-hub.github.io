/** 学习数据统计 */

export const STATS_STORAGE_KEY = 'cet4_study_stats_v1'

export type DailyStat = {
  learned: number
  correct: number
  wrong: number
  reviewed: number
}

export type StatsStore = Record<string, DailyStat>

export type StatsSummary = {
  streak: number
  today: DailyStat
  week: DailyStat
  accuracy: number
  activeDays: number
  last7: Array<{ date: string; total: number }>
}

function todayKey(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function loadStore(): StatsStore {
  try {
    const raw = localStorage.getItem(STATS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StatsStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: StatsStore) {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(store))
}

function emptyDay(): DailyStat {
  return { learned: 0, correct: 0, wrong: 0, reviewed: 0 }
}

export type StudyEvent = 'learn' | 'correct' | 'wrong' | 'review'

export function recordStudyEvent(event: StudyEvent, count = 1) {
  const key = todayKey()
  const store = loadStore()
  const day = { ...emptyDay(), ...store[key] }
  if (event === 'learn') day.learned += count
  if (event === 'correct') {
    day.correct += count
    day.learned += count
  }
  if (event === 'wrong') day.wrong += count
  if (event === 'review') day.reviewed += count
  store[key] = day
  saveStore(store)
}

function sumDays(store: StatsStore, keys: string[]): DailyStat {
  const out = emptyDay()
  for (const k of keys) {
    const d = store[k]
    if (!d) continue
    out.learned += d.learned
    out.correct += d.correct
    out.wrong += d.wrong
    out.reviewed += d.reviewed
  }
  return out
}

export function getStatsSummary(): StatsSummary {
  const store = loadStore()
  const today = todayKey()
  const todayStat = { ...emptyDay(), ...store[today] }

  const last7: Array<{ date: string; total: number }> = []
  const weekKeys: string[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const k = todayKey(d)
    weekKeys.push(k)
    const day = store[k]
    last7.push({
      date: k.slice(5),
      total: day ? day.correct + day.reviewed : 0,
    })
  }

  let streak = 0
  const cursor = new Date()
  for (;;) {
    const k = todayKey(cursor)
    const day = store[k]
    const active = day && (day.correct + day.reviewed + day.learned) > 0
    if (!active) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }

  const week = sumDays(store, weekKeys)
  const totalAttempts = week.correct + week.wrong
  const accuracy = totalAttempts > 0 ? Math.round((week.correct / totalAttempts) * 100) : 0
  const activeDays = Object.values(store).filter(
    (d) => d.correct + d.reviewed + d.learned > 0,
  ).length

  return { streak, today: todayStat, week, accuracy, activeDays, last7 }
}
