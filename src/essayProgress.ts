const KEY = 'cet4-essay-progress'

export type EssayProgress = {
  templatesDone: string[]
  examsRead: string[]
  mocksRead: string[]
  lastDailyId?: string
  lastDailyAt?: string
}

function defaultProgress(): EssayProgress {
  return { templatesDone: [], examsRead: [], mocksRead: [] }
}

export function readEssayProgress(): EssayProgress {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return defaultProgress()
    const p = JSON.parse(raw) as EssayProgress
    return {
      templatesDone: p.templatesDone ?? [],
      examsRead: p.examsRead ?? [],
      mocksRead: p.mocksRead ?? [],
      lastDailyId: p.lastDailyId,
      lastDailyAt: p.lastDailyAt,
    }
  } catch {
    return defaultProgress()
  }
}

function write(p: EssayProgress) {
  localStorage.setItem(KEY, JSON.stringify(p))
}

export function markTemplateDone(id: string) {
  const p = readEssayProgress()
  if (!p.templatesDone.includes(id)) p.templatesDone.push(id)
  write(p)
  return p
}

export function markExamRead(id: string) {
  const p = readEssayProgress()
  if (!p.examsRead.includes(id)) p.examsRead.push(id)
  write(p)
  return p
}

export function markMockRead(id: string) {
  const p = readEssayProgress()
  if (!p.mocksRead.includes(id)) p.mocksRead.push(id)
  write(p)
  return p
}

export function setDailyPractice(id: string) {
  const p = readEssayProgress()
  p.lastDailyId = id
  p.lastDailyAt = new Date().toISOString().slice(0, 10)
  write(p)
  return p
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w)).length
}
