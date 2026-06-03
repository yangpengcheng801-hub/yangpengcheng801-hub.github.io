export type WordLibrary = 'high-frequency' | 'all'

export const LIBRARY_CHOICE_KEY = 'cet4_current_library_v1'

export const LIBRARY_META: Record<
  WordLibrary,
  { file: string; label: string; theme: 'blue' | 'green'; totalHint: number }
> = {
  'high-frequency': {
    file: 'high-frequency-words.json',
    label: '10天高频冲刺（有道考频+百词斩）',
    theme: 'blue',
    totalHint: 1000,
  },
  all: {
    file: 'all-words.json',
    label: '全词库查漏',
    theme: 'green',
    totalHint: 4400,
  },
}

export function readLibraryChoice(): WordLibrary {
  try {
    return localStorage.getItem(LIBRARY_CHOICE_KEY) === 'all' ? 'all' : 'high-frequency'
  } catch {
    return 'high-frequency'
  }
}

export function writeLibraryChoice(library: WordLibrary) {
  try {
    localStorage.setItem(LIBRARY_CHOICE_KEY, library)
  } catch {
    /* ignore */
  }
}

/** 词库隔离存储 Key */
export function storageKey(library: WordLibrary, base: string): string {
  return `cet4_${library}_${base}`
}

export interface DailyTask {
  completedDays: number
  completedWords: number
  dailyTarget: number
  lastCompletedDate: string
  /** 今日新掌握词数（用于每日目标） */
  todayWords: number
  /** 与 todayWords 对应的日期 YYYY-MM-DD */
  todayDate: string
}

export const DEFAULT_DAILY_TASK: DailyTask = {
  completedDays: 0,
  completedWords: 0,
  dailyTarget: 100,
  lastCompletedDate: '',
  todayWords: 0,
  todayDate: '',
}

function todayDateStr(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

/** 全词库：记录新掌握 1 个词，更新每日任务与累计天数 */
export function advanceDailyTask(
  task: DailyTask,
  library: WordLibrary,
  wordCount: number,
): DailyTask {
  if (library !== 'all') return task

  const today = todayDateStr()
  let next: DailyTask = { ...task }

  if (next.todayDate !== today) {
    next = { ...next, todayWords: 0, todayDate: today }
  }

  next.completedWords = (next.completedWords || 0) + 1
  next.todayWords = (next.todayWords || 0) + 1
  next.dailyTarget = getDailyTarget(library, wordCount, next)

  if (next.todayWords >= next.dailyTarget && next.lastCompletedDate !== today) {
    next.completedDays = (next.completedDays || 0) + 1
    next.lastCompletedDate = today
  }

  return next
}

export function advanceDailyTaskByCount(
  task: DailyTask,
  library: WordLibrary,
  wordCount: number,
  count: number,
): DailyTask {
  let next = task
  for (let i = 0; i < count; i++) {
    next = advanceDailyTask(next, library, wordCount)
  }
  return next
}

export function getDailyTarget(
  library: WordLibrary,
  wordCount: number,
  task: DailyTask,
): number {
  if (library === 'high-frequency') {
    return Math.min(150, Math.max(1, Math.ceil(wordCount / 10)))
  }
  const remainingDays = Math.max(1, 10 - (task.completedDays || 0))
  const remainingWords = Math.max(0, wordCount - (task.completedWords || 0))
  return Math.min(200, Math.max(1, Math.ceil(remainingWords / remainingDays)))
}

export function countMastered(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data.length : 0
  } catch {
    return 0
  }
}

export function countWrong(key: string): number {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return 0
    const data = JSON.parse(raw) as Record<string, number>
    return Object.keys(data).filter((k) => (data[k] ?? 0) > 0).length
  } catch {
    return 0
  }
}

export function readOverview() {
  const hfM = storageKey('high-frequency', 'mastered_v1')
  const hfW = storageKey('high-frequency', 'wrong_v1')
  const allM = storageKey('all', 'mastered_v1')
  const allW = storageKey('all', 'wrong_v1')
  return {
    hfMastered: countMastered(hfM),
    hfWrong: countWrong(hfW),
    allMastered: countMastered(allM),
    allWrong: countWrong(allW),
    totalWrong: countWrong(hfW) + countWrong(allW),
  }
}

export async function fetchWordLibrary(library: WordLibrary) {
  const file = LIBRARY_META[library].file
  const res = await fetch(`/${file}`)
  if (!res.ok) throw new Error(`load ${file} failed`)
  return res.json()
}

/** 旧版全局 Key 迁移到当前词库（仅当新 Key 为空） */
export function migrateLegacyStorage(library: WordLibrary, bases: string[]) {
  const legacy: Record<string, string> = {
    mastered_v1: 'cet4_mastered_v1',
    wrong_v1: 'cet4_wrong_v1',
    learn_index_v1: 'cet4_learn_index_v1',
    sentence_cache_v1: 'cet4_sentence_cache_v1',
    display_mode_v1: 'cet4_display_mode_v1',
    daily_task_v1: 'cet4_daily_task_v1',
  }
  for (const base of bases) {
    const newKey = storageKey(library, base)
    if (localStorage.getItem(newKey)) continue
    const oldKey = legacy[base]
    if (!oldKey) continue
    const val = localStorage.getItem(oldKey)
    if (val) localStorage.setItem(newKey, val)
  }
}
