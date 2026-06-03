import { DICT_USER_AGENT, PROXY_DICT_PATH, resolveApiProxyUrl, shouldUseApiProxy } from './apiClient'
import { sentenceCoversAllWords, wordAppearsInSentence } from './sentenceCoverage'

export const EXAM_SENTS_CACHE_KEY = 'cet4_exam_sents_v1'

export type ExamSentence = {
  en: string
  zh: string
  source: string
  word: string
}

type ExamCache = Record<string, { sents: ExamSentence[]; at: number }>

const TTL = 30 * 24 * 60 * 60 * 1000

function loadCache(): ExamCache {
  try {
    const raw = localStorage.getItem(EXAM_SENTS_CACHE_KEY)
    return raw ? (JSON.parse(raw) as ExamCache) : {}
  } catch {
    return {}
  }
}

function saveCache(cache: ExamCache) {
  try {
    localStorage.setItem(EXAM_SENTS_CACHE_KEY, JSON.stringify(cache))
  } catch {
    /* quota */
  }
}

function parsePastExamSents(data: unknown, word: string): ExamSentence[] {
  const results: ExamSentence[] = []
  const seen = new Set<string>()

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return
    const obj = node as Record<string, unknown>
    if (Array.isArray(obj.pastExamSents)) {
      for (const item of obj.pastExamSents) {
        const row = item as { en?: string; zh?: string; source?: string }
        const en = String(row.en ?? '').trim()
        const zh = String(row.zh ?? '').trim()
        if (!en || seen.has(en)) continue
        seen.add(en)
        results.push({
          en,
          zh: zh || '（暂无翻译）',
          source: String(row.source ?? '真题'),
          word,
        })
      }
    }
    for (const v of Object.values(obj)) walk(v)
  }
  walk(data)
  return results
}

export async function fetchExamSentences(word: string): Promise<ExamSentence[]> {
  const key = word.trim().toLowerCase()
  if (!key) return []

  const cache = loadCache()
  const hit = cache[key]
  if (hit && Date.now() - hit.at < TTL) return hit.sents

  let data: unknown = null
  if (shouldUseApiProxy()) {
    const res = await fetch(`${resolveApiProxyUrl(PROXY_DICT_PATH)}?q=${encodeURIComponent(key)}`)
    if (res.ok) data = await res.json().catch(() => null)
  } else {
    const res = await fetch(
      `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(key)}&doctype=json`,
      { headers: { 'User-Agent': DICT_USER_AGENT } },
    )
    if (res.ok) data = await res.json().catch(() => null)
  }

  const sents = parsePastExamSents(data, key).slice(0, 3)
  cache[key] = { sents, at: Date.now() }
  saveCache(cache)
  return sents
}

/** 为本组词选一条真题例句：须覆盖本组全部单词，否则返回 null */
export async function fetchExamSentenceForGroup(
  words: Array<{ word: string }>,
): Promise<ExamSentence | null> {
  if (!words.length) return null

  const seen = new Set<string>()
  const candidates: ExamSentence[] = []

  for (const w of words) {
    const sents = await fetchExamSentences(w.word)
    for (const s of sents) {
      if (seen.has(s.en)) continue
      seen.add(s.en)
      candidates.push(s)
    }
  }

  let best: ExamSentence | null = null
  let bestScore = 0
  for (const s of candidates) {
    const score = words.filter((w) => wordAppearsInSentence(s.en, w.word)).length
    if (score > bestScore) {
      bestScore = score
      best = s
    }
  }

  if (best && sentenceCoversAllWords(best.en, words)) return best
  return null
}
