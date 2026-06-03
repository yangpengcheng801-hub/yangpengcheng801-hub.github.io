import fs from 'fs'
import path from 'path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const rootDir = path.resolve('..')
const outFile = path.resolve('public', 'words.json')

// 只读取这一个 PDF（可按需修改）
const singlePdf = path.resolve(
  '..',
  '【星星·独家资料包】大学英语四级词汇(完整版)(可打印）',
  '大学英语四级词汇完整带音标-可打印-可编辑-乱序版.pdf'
)

function normalizeWord(raw) {
  return raw
    .toLowerCase()
    .replace(/^[^a-z]+|[^a-z'\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isWordCandidate(word) {
  if (!word) return false
  if (word.length < 2 || word.length > 32) return false
  if (!/^[a-z][a-z'\-\s]*$/.test(word)) return false
  return true
}

function parseLineByRules(line, source) {
  const cleaned = line
    .replaceAll('', ' ')
    .replace(/[•·●]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) return []

  const patterns = [
    /^([A-Za-z][A-Za-z'\-]{1,30})\s+(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|vt\.|vi\.)\s*(.+)$/i,
    /^([A-Za-z][A-Za-z'\-]{1,30})\s*[：:]\s*(.+)$/,
    /^([A-Za-z][A-Za-z'\-]{1,30})\s+(.{2,120})$/,
    /^([A-Za-z][A-Za-z'\-]{1,30})\s*\(([^)]+)\)\s*(.+)$/,
  ]

  for (const p of patterns) {
    const m = cleaned.match(p)
    if (!m) continue

    let word = normalizeWord(m[1])
    let meaning = ''
    let pos = ''

    if (m.length >= 4 && /^(n\.|v\.|adj\.|adv\.|prep\.|conj\.|pron\.|vt\.|vi\.)$/i.test(m[2])) {
      pos = m[2]
      meaning = m[3]
    } else if (m.length >= 4 && m[3]) {
      meaning = `${m[2]} ${m[3]}`
    } else {
      meaning = m[2] || ''
    }

    meaning = meaning
      .replace(/^[-—:,;\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!isWordCandidate(word)) continue
    if (!meaning || meaning.length < 1) continue

    return [{ word, meaning, pos, source, level: 0 }]
  }

  return []
}

function parseLines(text, source) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

  const words = []
  for (const line of lines) {
    words.push(...parseLineByRules(line, source))
  }

  return words
}

async function extractTextFromPdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath))
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const chunks = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    const pageText = content.items
      .map((it) => ('str' in it ? it.str : ''))
      .join('\n')

    chunks.push(pageText)
  }

  return chunks.join('\n')
}

async function run() {
  const files = [singlePdf].filter((f) => fs.existsSync(f))

  if (!files.length) {
    throw new Error(`PDF not found: ${singlePdf}`)
  }

  const dict = new Map()

  for (const file of files) {
    const source = path.basename(file)
    const text = await extractTextFromPdf(file)
    const items = parseLines(text, source)

    for (const it of items) {
      if (!dict.has(it.word)) dict.set(it.word, it)
    }

    console.log(`parsed: ${source} -> ${items.length} items`)
  }

  const result = [...dict.values()].sort((a, b) => a.word.localeCompare(b.word))
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), 'utf-8')
  console.log(`Synced ${files.length} PDFs, extracted ${result.length} unique words -> ${outFile}`)
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
