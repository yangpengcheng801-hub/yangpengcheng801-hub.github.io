/**
 * 解析 40篇搞定3500单词 HTML → public/forty-articles.json
 * 源文件：scripts/forty-articles-source.html
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(__dirname, 'forty-articles-source.html')
const out = join(root, 'public', 'forty-articles.json')
const outBundled = join(root, 'src', 'articles', 'forty-articles.json')

function cleanBlock(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function parseArticles(html) {
  const articles = []
  const re =
    /<h2>\s*(\d+)\.\s*([^<]+)<\/h2>\s*<div class="en">\s*([\s\S]*?)<\/div>\s*<div class="zh">\s*([\s\S]*?)<\/div>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    articles.push({
      id: Number(m[1]),
      title: m[2].trim(),
      en: cleanBlock(m[3]),
      zh: cleanBlock(m[4]),
    })
  }
  return articles.sort((a, b) => a.id - b.id)
}

const html = readFileSync(src, 'utf8')
const articles = parseArticles(html)
if (!articles.length) {
  console.error('未解析到文章，请检查 forty-articles-source.html')
  process.exit(1)
}

mkdirSync(dirname(out), { recursive: true })
mkdirSync(dirname(outBundled), { recursive: true })
const payload = JSON.stringify(
  {
    title: '40篇搞定3500单词',
    subtitle: '纯原文 + 翻译 · 覆盖四级核心词汇',
    count: articles.length,
    articles,
  },
  null,
  2,
)
writeFileSync(out, payload)
writeFileSync(outBundled, payload)
console.log(`forty-articles.json: ${articles.length} 篇 → ${out}`)
console.log(`forty-articles.json: ${articles.length} 篇 → ${outBundled}`)
