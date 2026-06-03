/**
 * 从四级词库生成紧凑英汉词典 public/dictionary.json
 * 格式: { "word": { "m": "释义", "p": "音标" } }
 */
import fs from 'fs'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const allWordsFile = path.join(root, 'public', 'all-words.json')
const hfWordsFile = path.join(root, 'public', 'high-frequency-words.json')
const outFile = path.join(root, 'public', 'dictionary.json')

function normalizeWord(w) {
  return String(w ?? '')
    .toLowerCase()
    .trim()
    .replace(/^\W+|\W+$/g, '')
}

function extractPos(meaning) {
  const m = meaning.match(/(?:^|[\s;；])((?:n|v|adj|adv|prep|conj|pron|vt|vi|aux)\.)/i)
  return m?.[1] ?? ''
}

function cleanMeaning(meaning) {
  return String(meaning ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([,;；，。])\s*/g, '$1')
    .replace(/\.{3,}/g, '...')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .trim()
}

function cleanPhonetic(phonetic) {
  const raw = String(phonetic ?? '').trim()
  if (!raw) return ''
  return raw.startsWith('/') && raw.endsWith('/') ? raw : `/${raw.replace(/^\/|\/$/g, '')}/`
}

function addEntry(dict, word, meaning, phonetic, pos) {
  const key = normalizeWord(word)
  const cleanedMeaning = cleanMeaning(meaning)
  if (!key || !cleanedMeaning) return
  const existing = dict[key]
  if (existing && existing.m.length >= cleanedMeaning.length) return
  const entry = { m: cleanedMeaning }
  const cleanedPhonetic = cleanPhonetic(phonetic)
  if (cleanedPhonetic) entry.p = cleanedPhonetic
  const p = pos?.trim() || extractPos(cleanedMeaning)
  if (p) entry.o = p
  dict[key] = entry
}

function loadJson(file) {
  if (!fs.existsSync(file)) return []
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

const dict = {}

for (const w of loadJson(allWordsFile)) {
  addEntry(dict, w.word, w.meaning, w.phonetic, w.pos)
}
for (const w of loadJson(hfWordsFile)) {
  addEntry(dict, w.word, w.meaning, w.phonetic, w.pos)
}

const sorted = Object.fromEntries(Object.keys(dict).sort().map((k) => [k, dict[k]]))
fs.writeFileSync(outFile, JSON.stringify(sorted, null, 2))
console.log(`dictionary.json: ${Object.keys(sorted).length} entries → ${outFile}`)
