/** 内置英汉词典（由四级词库生成，见 scripts/build-dictionary.mjs） */

import { assetPath } from './assetPath'

export type DictEntry = {
  word: string
  meaning: string
  phonetic?: string
  pos?: string
  /** 实际匹配到的词根（变形词查词时） */
  matched?: string
  /** 释义来源 */
  source?: 'local' | 'cached' | 'youdao' | 'ai'
}

type RawDictEntry = {
  m: string
  p?: string
  o?: string
}

let dictMap: Map<string, RawDictEntry> | null = null
let loadPromise: Promise<Map<string, RawDictEntry>> | null = null

const INFLECTION_SUFFIXES = [
  'ingly',
  'edly',
  'ing',
  'ed',
  'ies',
  'es',
  's',
  'ly',
  'er',
  'est',
  'ness',
  'ment',
  'tion',
  'sion',
  'able',
  'ible',
  'ful',
  'less',
]

export function normalizeDictWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z'-]/g, '')
}

export async function loadDictionary(): Promise<Map<string, RawDictEntry>> {
  if (dictMap) return dictMap
  if (loadPromise) return loadPromise

  loadPromise = (async () => {
    const res = await fetch(assetPath('dictionary.json'))
    if (!res.ok) throw new Error('词典加载失败')
    const raw = (await res.json()) as Record<string, RawDictEntry>
    dictMap = new Map(Object.entries(raw))
    return dictMap
  })()

  return loadPromise
}

function rawToEntry(word: string, raw: RawDictEntry, matched?: string): DictEntry {
  return {
    word,
    meaning: raw.m,
    phonetic: raw.p,
    pos: raw.o,
    matched,
  }
}

function lookupRaw(key: string, map: Map<string, RawDictEntry>): RawDictEntry | null {
  return map.get(key) ?? null
}

function tryStems(key: string, map: Map<string, RawDictEntry>): { raw: RawDictEntry; stem: string } | null {
  for (const suffix of INFLECTION_SUFFIXES) {
    if (!key.endsWith(suffix) || key.length <= suffix.length + 2) continue
    let stem = key.slice(0, -suffix.length)
    if (suffix === 'ies' && stem.length > 1) {
      const tryY = `${stem.slice(0, -1)}y`
      const yHit = lookupRaw(tryY, map)
      if (yHit) return { raw: yHit, stem: tryY }
    }
    if (suffix === 'ing' || suffix === 'ed' || suffix === 'edly' || suffix === 'ingly') {
      const withE = `${stem}e`
      const eHit = lookupRaw(withE, map)
      if (eHit) return { raw: eHit, stem: withE }
      if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
        const short = stem.slice(0, -1)
        const dHit = lookupRaw(short, map)
        if (dHit) return { raw: dHit, stem: short }
      }
    }
    const hit = lookupRaw(stem, map)
    if (hit) return { raw: hit, stem }
  }
  return null
}

export function lookupWord(word: string, map: Map<string, RawDictEntry>): DictEntry | null {
  const key = normalizeDictWord(word)
  if (!key || key.length < 1) return null

  const direct = lookupRaw(key, map)
  if (direct) return { ...rawToEntry(key, direct), source: 'local' }

  const stemHit = tryStems(key, map)
  if (stemHit) return { ...rawToEntry(key, stemHit.raw, stemHit.stem), source: 'local' }

  return null
}

export function lookupWordAsync(word: string): Promise<DictEntry | null> {
  return loadDictionary().then((map) => lookupWord(word, map))
}

/** 词库释义较短时，用内置词典补全（高频词百词斩释义常比词典少） */
export function getRicherMeaning(
  word: string,
  fallback: string,
  map: Map<string, RawDictEntry> | null | undefined,
): string {
  if (!map) return fallback
  const entry = lookupWord(word, map)
  if (!entry?.meaning?.trim()) return fallback
  const fromDict = entry.meaning.trim()
  const base = fallback.trim()
  return fromDict.length > base.length ? fromDict : base
}
