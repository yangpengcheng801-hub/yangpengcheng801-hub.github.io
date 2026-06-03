import { chatWithModelFallback } from './aiChat'
import { DICT_USER_AGENT, PROXY_DICT_PATH, resolveApiProxyUrl, resolveYoudaoDictUrl, shouldUseApiProxy } from './apiClient'
import { normalizeDictWord, type DictEntry } from './dictionary'

export const ONLINE_DICT_CACHE_KEY = 'cet4_online_dict_v1'
const MAX_CACHE_ENTRIES = 600

export type DictSource = 'local' | 'cached' | 'youdao' | 'ai'

type StoredEntry = {
  m: string
  p?: string
  o?: string
  src: 'youdao' | 'ai'
  at: number
}

type OnlineDictStore = Record<string, StoredEntry>

let memoryCache: OnlineDictStore | null = null
const pendingLookups = new Map<string, Promise<DictEntry | null>>()

function loadStore(): OnlineDictStore {
  if (memoryCache) return memoryCache
  try {
    const raw = localStorage.getItem(ONLINE_DICT_CACHE_KEY)
    memoryCache = raw ? (JSON.parse(raw) as OnlineDictStore) : {}
  } catch {
    memoryCache = {}
  }
  return memoryCache
}

function persistStore(store: OnlineDictStore) {
  memoryCache = store
  try {
    localStorage.setItem(ONLINE_DICT_CACHE_KEY, JSON.stringify(store))
  } catch {
    /* quota exceeded — trim and retry */
    const trimmed = trimStore(store, Math.floor(MAX_CACHE_ENTRIES * 0.7))
    memoryCache = trimmed
    try {
      localStorage.setItem(ONLINE_DICT_CACHE_KEY, JSON.stringify(trimmed))
    } catch {
      /* ignore */
    }
  }
}

function trimStore(store: OnlineDictStore, limit: number): OnlineDictStore {
  const entries = Object.entries(store).sort((a, b) => b[1].at - a[1].at)
  return Object.fromEntries(entries.slice(0, limit))
}

function storedToEntry(key: string, stored: StoredEntry, asCached: boolean): DictEntry {
  return {
    word: key,
    meaning: stored.m,
    phonetic: stored.p,
    pos: stored.o,
    source: asCached ? 'cached' : stored.src,
  }
}

export function getOnlineDictEntry(word: string): DictEntry | null {
  const key = normalizeDictWord(word)
  if (!key) return null
  const stored = loadStore()[key]
  if (!stored) return null
  return storedToEntry(key, stored, true)
}

export function saveOnlineDictEntry(word: string, entry: DictEntry, src: 'youdao' | 'ai') {
  const key = normalizeDictWord(word)
  if (!key || !entry.meaning) return
  const store = { ...loadStore() }
  store[key] = {
    m: entry.meaning,
    p: entry.phonetic,
    o: entry.pos,
    src,
    at: Date.now(),
  }
  persistStore(trimStore(store, MAX_CACHE_ENTRIES))
}

type YoudaoTr = { l?: { i?: string[] } }
type YoudaoResponse = {
  ec?: {
    word?: Array<{
      usphone?: string
      ukphone?: string
      trs?: Array<{ tr?: YoudaoTr[] }>
    }>
  }
  simple?: { word?: Array<{ explains?: string[]; usphone?: string; ukphone?: string }> }
  fanyi?: { tran?: string }
}

function extractPos(meaning: string): string | undefined {
  const m = meaning.match(/^((?:n|v|adj|adv|prep|conj|pron|vt|vi|int|aux)\.)/i)
  return m?.[1]
}

export function parseYoudaoResponse(data: unknown, word: string): DictEntry | null {
  const j = data as YoudaoResponse
  const ecWord = j.ec?.word?.[0]
  const meanings: string[] = []

  for (const trGroup of ecWord?.trs ?? []) {
    for (const tr of trGroup.tr ?? []) {
      for (const item of tr.l?.i ?? []) {
        if (typeof item === 'string' && item.trim()) meanings.push(item.trim())
      }
    }
  }

  if (!meanings.length) {
    const explains = j.simple?.word?.[0]?.explains
    if (explains?.length) meanings.push(...explains.filter(Boolean))
  }

  if (!meanings.length && j.fanyi?.tran) {
    meanings.push(String(j.fanyi.tran).trim())
  }

  if (!meanings.length) return null

  const meaning = meanings.slice(0, 4).join('；')
  const phonetic =
    ecWord?.usphone?.trim() ||
    ecWord?.ukphone?.trim() ||
    j.simple?.word?.[0]?.usphone?.trim() ||
    j.simple?.word?.[0]?.ukphone?.trim()

  return {
    word: normalizeDictWord(word),
    meaning,
    phonetic: phonetic || undefined,
    pos: extractPos(meaning),
    source: 'youdao',
  }
}

async function fetchYoudao(word: string): Promise<DictEntry | null> {
  let data: unknown = null
  if (shouldUseApiProxy()) {
    const res = await fetch(`${resolveApiProxyUrl(PROXY_DICT_PATH)}?q=${encodeURIComponent(word)}`)
    if (!res.ok) return null
    data = await res.json().catch(() => null)
  } else {
    const res = await fetch(resolveYoudaoDictUrl(word), {
      headers: { 'User-Agent': DICT_USER_AGENT },
    })
    if (!res.ok) return null
    data = await res.json().catch(() => null)
  }
  return parseYoudaoResponse(data, word)
}

function parseAiDictResponse(raw: string, word: string): DictEntry | null {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const p = JSON.parse(jsonMatch[0]) as {
      meaning?: string
      phonetic?: string
      pos?: string
    }
    const meaning = String(p.meaning ?? '').trim()
    if (!meaning) return null
    return {
      word: normalizeDictWord(word),
      meaning,
      phonetic: p.phonetic?.trim() || undefined,
      pos: p.pos?.trim() || extractPos(meaning),
      source: 'ai',
    }
  } catch {
    return null
  }
}

async function fetchAiDict(word: string, apiKey: string): Promise<DictEntry | null> {
  const { content } = await chatWithModelFallback(
    apiKey,
    {
      temperature: 0.2,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            '你是英汉词典。给出准确简洁的中文释义。严格输出 JSON：{"meaning":"释义（含词性如 n. / v.）","phonetic":"音标可选","pos":"词性可选"}',
        },
        { role: 'user', content: `单词：${word}` },
      ],
    },
    undefined,
    (raw) => parseAiDictResponse(raw, word) !== null,
  )
  return parseAiDictResponse(content, word)
}

/** 联网查词：有道 → AI 兜底，成功后写入本地缓存 */
export async function lookupWordOnline(word: string, apiKey?: string): Promise<DictEntry | null> {
  const key = normalizeDictWord(word)
  if (!key) return null

  const cached = getOnlineDictEntry(key)
  if (cached) return cached

  const pending = pendingLookups.get(key)
  if (pending) return pending

  const task = (async (): Promise<DictEntry | null> => {
    try {
      let entry = await fetchYoudao(key)
      let src: 'youdao' | 'ai' = 'youdao'

      if (!entry && apiKey) {
        entry = await fetchAiDict(key, apiKey)
        src = 'ai'
      }

      if (entry) {
        saveOnlineDictEntry(key, entry, src)
        return { ...entry, source: src }
      }
      return null
    } finally {
      pendingLookups.delete(key)
    }
  })()

  pendingLookups.set(key, task)
  return task
}

export function countOnlineCache(): number {
  return Object.keys(loadStore()).length
}
