/**
 * 按有道四级考频 + 百词斩释义，重建 high-frequency-words.json
 *
 * 用法：
 *   node scripts/build-hf-words-ranked.mjs          # 全词库扫描（较慢，约 15 分钟）
 *   node scripts/build-hf-words-ranked.mjs --quick  # 仅刷新现有 972 高频词（约 3 分钟）
 */
import fs from 'fs'
import path from 'path'
import { fetchYoudaoExamInfo } from './youdao-exam.mjs'

const root = path.resolve(import.meta.dirname, '..')
const allWordsFile = path.join(root, 'public', 'all-words.json')
const hfFile = path.join(root, 'public', 'high-frequency-words.json')
const cacheFile = path.join(root, 'scripts', 'cache', 'youdao-exam-freq.json')
const HF_TARGET = 972
const DELAY_MS = 180

const quick = process.argv.includes('--quick')

function normalizeWord(w) {
  return String(w ?? '')
    .toLowerCase()
    .trim()
    .replace(/^\W+|\W+$/g, '')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function loadCache() {
  if (!fs.existsSync(cacheFile)) return {}
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'))
  } catch {
    return {}
  }
}

function saveCache(cache) {
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true })
  fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2), 'utf8')
}

function bczFileKey(word) {
  return word.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_')
}

async function fetchBaicizhan(word) {
  const key = bczFileKey(word)
  const url = `https://cdn.jsdelivr.net/gh/lyc8503/baicizhan-word-meaning-API/data/words/${encodeURIComponent(key)}.json`
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.mean_cn) return null
    return {
      meaning: String(data.mean_cn).trim(),
      phonetic: String(data.accent ?? '').trim() || undefined,
    }
  } catch {
    return null
  }
}

async function ensureExamInfo(word, cache) {
  const key = normalizeWord(word)
  if (!key) return null
  if (cache[key]?.fetchedAt) return cache[key]

  const info = await fetchYoudaoExamInfo(key)
  cache[key] = {
    ...(info ?? { frequency: 0, year: 0, isCet4: false, examTypes: [] }),
    fetchedAt: Date.now(),
  }
  return cache[key]
}

async function main() {
  const allRaw = JSON.parse(fs.readFileSync(allWordsFile, 'utf8'))
  const byWord = new Map()
  for (const item of allRaw) {
    const w = normalizeWord(item.word)
    if (w && !byWord.has(w)) byWord.set(w, item)
  }

  const pool = quick
    ? JSON.parse(fs.readFileSync(hfFile, 'utf8')).map((x) => normalizeWord(x.word))
    : [...byWord.keys()]

  const cache = loadCache()
  let done = 0
  console.log(`扫描 ${pool.length} 个词，从有道获取四级考频…`)

  for (const w of pool) {
    await ensureExamInfo(w, cache)
    done++
    if (done % 25 === 0) {
      saveCache(cache)
      console.log(`  已处理 ${done}/${pool.length}`)
    }
    await sleep(DELAY_MS)
  }
  saveCache(cache)

  const ranked = []
  for (const [w, item] of byWord) {
    const exam = cache[w]
    if (!exam) continue
    const freq = Number(exam.frequency) || 0
    const isCet4 = exam.isCet4 || freq > 0
    if (!isCet4 && !quick) continue
    ranked.push({
      word: w,
      item,
      frequency: freq,
      year: Number(exam.year) || 0,
      examTypes: exam.examTypes ?? [],
    })
  }

  ranked.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency
    if (b.year !== a.year) return b.year - a.year
    return a.word.localeCompare(b.word)
  })

  const top = ranked.slice(0, HF_TARGET)
  console.log(`取考频最高的 ${top.length} 个词，补充百词斩释义…`)

  const output = []
  let bczHits = 0
  for (let i = 0; i < top.length; i++) {
    const { word: w, item, frequency, year, examTypes } = top[i]
    const bcz = await fetchBaicizhan(w)
    if (bcz) bczHits++
    const entry = {
      ...item,
      word: item.word || w,
      examFreq: frequency,
      examYear: year,
      examTypes: examTypes.filter((t) => /CET4|四级/i.test(t)),
      freqRank: i + 1,
    }
    if (bcz?.meaning) entry.meaning = bcz.meaning
    if (bcz?.phonetic) entry.phonetic = bcz.phonetic
    if (bcz?.meaning) entry.meaningSource = 'baicizhan'
    output.push(entry)
    if ((i + 1) % 40 === 0) console.log(`  百词斩 ${i + 1}/${top.length}`)
    await sleep(80)
  }

  fs.writeFileSync(hfFile, JSON.stringify(output, null, 2), 'utf8')
  console.log(`\n完成 → ${hfFile}`)
  console.log(`  词数: ${output.length}`)
  console.log(`  百词斩命中释义: ${bczHits}`)
  console.log(
    `  考频范围: ${output[output.length - 1]?.examFreq ?? 0} ~ ${output[0]?.examFreq ?? 0}`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
