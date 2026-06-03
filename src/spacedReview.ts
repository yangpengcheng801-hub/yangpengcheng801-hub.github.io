/** 错词间隔复习（艾宾浩斯简化版） */

export const SRS_STORAGE_KEY = 'cet4_srs_v1'

/** 复习间隔：天 */
export const SRS_INTERVALS_DAYS = [1, 2, 4, 7, 14, 30]

export type SrsEntry = {
  wordId: string
  level: number
  nextReview: number
  lastWrong: number
  correctStreak: number
}

export type SrsStore = Record<string, SrsEntry>

function loadStore(): SrsStore {
  try {
    const raw = localStorage.getItem(SRS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SrsStore) : {}
  } catch {
    return {}
  }
}

function saveStore(store: SrsStore) {
  localStorage.setItem(SRS_STORAGE_KEY, JSON.stringify(store))
}

function daysToMs(days: number) {
  return days * 24 * 60 * 60 * 1000
}

export function recordSrsWrong(wordId: string, now = Date.now()): SrsEntry {
  const store = loadStore()
  const prev = store[wordId]
  const entry: SrsEntry = {
    wordId,
    level: 0,
    nextReview: now + daysToMs(SRS_INTERVALS_DAYS[0]),
    lastWrong: now,
    correctStreak: 0,
  }
  if (prev) {
    entry.level = Math.max(0, prev.level - 1)
    entry.nextReview = now + daysToMs(SRS_INTERVALS_DAYS[entry.level] ?? 1)
  }
  store[wordId] = entry
  saveStore(store)
  return entry
}

export function advanceSrs(wordId: string, now = Date.now()): SrsEntry | null {
  const store = loadStore()
  const prev = store[wordId]
  if (!prev) return null
  const nextLevel = Math.min(prev.level + 1, SRS_INTERVALS_DAYS.length - 1)
  const entry: SrsEntry = {
    ...prev,
    level: nextLevel,
    correctStreak: prev.correctStreak + 1,
    nextReview: now + daysToMs(SRS_INTERVALS_DAYS[nextLevel] ?? 30),
  }
  if (nextLevel >= SRS_INTERVALS_DAYS.length - 1 && entry.correctStreak >= 2) {
    delete store[wordId]
    saveStore(store)
    return null
  }
  store[wordId] = entry
  saveStore(store)
  return entry
}

export function getSrsEntry(wordId: string): SrsEntry | null {
  return loadStore()[wordId] ?? null
}

export function getDueSrsIds(now = Date.now()): string[] {
  const store = loadStore()
  return Object.values(store)
    .filter((e) => e.nextReview <= now)
    .sort((a, b) => a.nextReview - b.nextReview)
    .map((e) => e.wordId)
}

export function getDueSrsCount(now = Date.now()): number {
  return getDueSrsIds(now).length
}

export function getAllSrsEntries(): SrsEntry[] {
  return Object.values(loadStore()).sort((a, b) => a.nextReview - b.nextReview)
}

export function getNextSrsEntry(now = Date.now()): SrsEntry | null {
  return Object.values(loadStore())
    .filter((e) => e.nextReview > now)
    .sort((a, b) => a.nextReview - b.nextReview)[0] ?? null
}

export function removeSrsEntry(wordId: string): void {
  const store = loadStore()
  if (!store[wordId]) return
  delete store[wordId]
  saveStore(store)
}

export function clearSrsEntries(wordIds?: string[]): void {
  if (!wordIds) {
    saveStore({})
    return
  }
  const store = loadStore()
  let changed = false
  for (const id of wordIds) {
    if (!store[id]) continue
    delete store[id]
    changed = true
  }
  if (changed) saveStore(store)
}

export function formatNextReview(nextReview: number): string {
  const diff = nextReview - Date.now()
  if (diff <= 0) return '现在复习'
  const hours = Math.ceil(diff / (60 * 60 * 1000))
  if (hours < 24) return `${hours} 小时后`
  const days = Math.ceil(diff / daysToMs(1))
  return `${days} 天后`
}
