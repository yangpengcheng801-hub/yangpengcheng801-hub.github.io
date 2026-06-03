import fs from 'fs'
import path from 'path'
import xlsx from 'xlsx'

const outFile = path.resolve('public', 'words.json')
const sourceFile = path.resolve(
  '..',
  '【星星·独家资料包】大学英语四级词汇(完整版)(可打印）',
  '大学英语四级词汇完整带音标-可打印-可编辑-乱序版.xls'
)

function normalizeText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeWord(v) {
  return normalizeText(v)
    .toLowerCase()
    .replace(/^\W+|\W+$/g, '')
    .replace(/\s+/g, ' ')
}

function isWord(w) {
  return /^[a-z][a-z\-']{0,40}$/.test(w)
}

function pickColumns(headerRow) {
  const headers = headerRow.map((h) => normalizeText(h).toLowerCase())

  const find = (candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h.includes(c))
      if (idx >= 0) return idx
    }
    return -1
  }

  // 兼容中英文列名
  const wordIdx = find(['word', '单词'])
  const phoneticIdx = find(['phonetic', '音标'])
  const posIdx = find(['pos', '词性'])
  const meaningIdx = find(['meaning', '释义', '中文', '词义'])

  return { wordIdx, phoneticIdx, posIdx, meaningIdx }
}

function tryFallbackByPattern(row) {
  // 兜底：从整行中找英文单词 + 中文释义
  const cells = row.map((c) => normalizeText(c)).filter(Boolean)
  if (!cells.length) return null

  let word = ''
  let pos = ''
  let phonetic = ''
  let meaning = ''

  for (const c of cells) {
    if (!word) {
      const m = c.match(/^([A-Za-z][A-Za-z\-']{1,40})$/)
      if (m) {
        word = m[1]
        continue
      }
    }
    if (!phonetic && /\/.*\//.test(c) && /[\[\]\/]/.test(c)) phonetic = c
    if (!pos && /^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|vt\.|vi\.)$/i.test(c)) pos = c
    if (!meaning && /[\u4e00-\u9fff]/.test(c)) meaning = c
  }

  const nw = normalizeWord(word)
  if (!isWord(nw) || !meaning) return null
  return { word: nw, meaning: normalizeText(meaning), pos, phonetic }
}

function parseSheet(sheet, name) {
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
  if (!rows.length) return { items: [], scanned: 0 }

  // 找最像表头的一行
  let headerIdx = 0
  let bestScore = -1
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const r = rows[i].map((v) => normalizeText(v).toLowerCase())
    const score = r.filter((x) => ['word', '单词', '音标', '词性', '释义', '中文', '词义', 'meaning'].some((k) => x.includes(k))).length
    if (score > bestScore) {
      bestScore = score
      headerIdx = i
    }
  }

  const header = rows[headerIdx].map((v) => normalizeText(v))
  const { wordIdx, phoneticIdx, posIdx, meaningIdx } = pickColumns(header)

  const items = []
  let scanned = 0

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every((c) => !normalizeText(c))) continue
    scanned++

    let parsed = null

    if (wordIdx >= 0 && meaningIdx >= 0) {
      const rawWord = row[wordIdx]
      const rawMeaning = row[meaningIdx]
      const word = normalizeWord(rawWord)
      const meaning = normalizeText(rawMeaning)
      const pos = posIdx >= 0 ? normalizeText(row[posIdx]) : ''
      const phonetic = phoneticIdx >= 0 ? normalizeText(row[phoneticIdx]) : ''

      if (isWord(word) && meaning) {
        parsed = { word, meaning, pos, phonetic }
      }
    }

    if (!parsed) parsed = tryFallbackByPattern(row)
    if (!parsed) continue

    items.push({
      id: `xls-${parsed.word}`,
      word: parsed.word,
      meaning: parsed.meaning,
      pos: parsed.pos || undefined,
      phonetic: parsed.phonetic || undefined,
      source: `${path.basename(sourceFile)}#${name}`,
      level: 0,
      wrongCount: 0,
    })
  }

  return { items, scanned }
}

function run() {
  if (!fs.existsSync(sourceFile)) throw new Error(`XLS not found: ${sourceFile}`)

  const wb = xlsx.readFile(sourceFile, { cellDates: false })
  const all = []
  let scannedRows = 0

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const { items, scanned } = parseSheet(sheet, sheetName)
    scannedRows += scanned
    all.push(...items)
  }

  const dedup = new Map()
  for (const it of all) {
    if (!dedup.has(it.word)) dedup.set(it.word, it)
  }

  const result = [...dedup.values()].sort((a, b) => a.word.localeCompare(b.word))
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8')

  console.log(`XLS file: ${sourceFile}`)
  console.log(`Sheets: ${wb.SheetNames.length}`)
  console.log(`Scanned rows: ${scannedRows}`)
  console.log(`Parsed entries: ${all.length}`)
  console.log(`Unique words: ${result.length}`)
  console.log(`Output: ${outFile}`)
}

run()
