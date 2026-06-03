import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitEssayParagraphs, countWords } from './essay-text-fix.mjs'

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), 'cache', 'essay-audit')

function essayKey(m, essay, index) {
  return essay.id || essay.label?.replace(/\s+/g, '-') || `essay-${index}`
}

export function applyAuditToPack(data) {
  if (!existsSync(cacheDir)) return data

  const cache = new Map()
  for (const f of readdirSync(cacheDir).filter((x) => x.endsWith('.json'))) {
    try {
      const o = JSON.parse(readFileSync(join(cacheDir, f), 'utf8'))
      if (o.id) cache.set(o.id, o)
    } catch {
      /* skip */
    }
  }
  if (!cache.size) return data

  for (const t of data.templates ?? []) {
    const c = cache.get(`tpl-${t.id}`)
    if (!c) continue
    if (c.sampleEssay) {
      t.sampleEssay = c.sampleEssay
      t.sampleParagraphs = c.sampleParagraphs ?? splitEssayParagraphs(c.sampleEssay)
      t.wordCount = countWords(c.sampleEssay)
    }
    if (c.fillInBlocks) t.fillInBlocks = c.fillInBlocks
  }

  const mergeExam = (e, prefix) => {
    const c = cache.get(`${prefix}-${e.id}`)
    if (!c?.essay) return
    if (c.titleEn) e.titleEn = c.titleEn
    e.essay = c.essay
    e.essayParagraphs = c.essayParagraphs ?? splitEssayParagraphs(c.essay)
    e.wordCount = c.wordCount ?? countWords(e.essay)
  }

  for (const e of data.pastExams ?? []) mergeExam(e, 'exam')
  for (const e of data.recentCet4 ?? []) mergeExam(e, 'exam')

  for (const m of data.mockTests ?? []) {
    for (let i = 0; i < (m.essays ?? []).length; i++) {
      const essay = m.essays[i]
      const key = essayKey(m, essay, i)
      const c = cache.get(`mock-${m.id}-${key}`)
      if (!c?.essay) continue
      essay.body = c.essay
      essay.paragraphs = c.essayParagraphs ?? splitEssayParagraphs(c.essay)
      essay.wordCount = c.wordCount ?? countWords(c.essay)
    }
  }

  const lib = data.phraseLibrary
  if (lib?.phraseSets?.sets) {
    for (const [key, set] of Object.entries(lib.phraseSets.sets)) {
      const c = cache.get(`phrases-${key}`)
      if (c?.items) set.items = c.items
    }
  }
  if (lib?.chartPhrases) {
    const c = cache.get('phrases-chart')
    if (c?.items) lib.chartPhrases = c.items
  }

  return data
}
