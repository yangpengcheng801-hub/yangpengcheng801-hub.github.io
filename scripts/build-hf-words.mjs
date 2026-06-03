import fs from 'fs'
import path from 'path'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

const root = path.resolve('..')
const pdfFile = path.join(root, '四级高频1000词.pdf')
const allWordsFile = path.resolve('public', 'words.json')
const outFile = path.resolve('public', 'high-frequency-words.json')
const allOutFile = path.resolve('public', 'all-words.json')

function normalizeWord(w) {
  return String(w ?? '')
    .toLowerCase()
    .trim()
    .replace(/^\W+|\W+$/g, '')
}

async function extractPdfText() {
  const data = new Uint8Array(fs.readFileSync(pdfFile))
  const doc = await pdfjsLib.getDocument({ data, disableWorker: true }).promise
  let text = ''
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    text += `${content.items.map((it) => ('str' in it ? it.str : '')).join(' ')}\n`
  }
  return text
}

async function extractOrderedEntries() {
  const text = await extractPdfText()
  const ordered = []
  const used = new Set()
  const re =
    /(\d+)\.\s*([a-z][a-z'-]+)\s*[（(]考频[^）)]*[）)]\s*([^0-9]+?)(?=\s*\d+\.\s*[a-z]|$)/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const w = normalizeWord(m[2])
    const meaning = String(m[3] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    if (!w || used.has(w) || !meaning) continue
    used.add(w)
    ordered.push({ word: w, meaning })
  }
  if (ordered.length >= 900) return ordered

  // 兜底：仅提取单词列表
  const words = []
  const re2 = /\d+\.\s*([a-z][a-z'-]+)\s*[（(]考频/gi
  while ((m = re2.exec(text)) !== null) {
    const w = normalizeWord(m[1])
    if (!w || used.has(w)) continue
    used.add(w)
    words.push({ word: w, meaning: w })
  }
  return words
}

function main() {
  const allRaw = JSON.parse(fs.readFileSync(allWordsFile, 'utf8'))
  if (!fs.existsSync(allOutFile)) {
    fs.copyFileSync(allWordsFile, allOutFile)
    console.log('Created all-words.json')
  }

  const byWord = new Map()
  for (const item of allRaw) {
    const w = normalizeWord(item.word)
    if (w && !byWord.has(w)) byWord.set(w, item)
  }

  const run = async () => {
    const entries = await extractOrderedEntries()
    const ordered = []
    const missing = []
    for (const { word: w, meaning: pdfMeaning } of entries) {
      if (byWord.has(w)) {
        ordered.push(byWord.get(w))
      } else {
        missing.push(w)
        ordered.push({
          id: `hf-${w}`,
          word: w,
          meaning: pdfMeaning,
          pos: '',
        })
      }
    }

    fs.writeFileSync(outFile, JSON.stringify(ordered, null, 2), 'utf8')
    console.log(`high-frequency-words.json: ${ordered.length} words (PDF parsed ${entries.length})`)
    if (missing.length) console.log(`filled from PDF only: ${missing.length}`)
  }

  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

main()
