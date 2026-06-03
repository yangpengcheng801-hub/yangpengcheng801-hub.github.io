import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const checkedFiles = [
  'index.html',
  'public/manifest.webmanifest',
  'public/dictionary.json',
  'public/high-frequency-words.json',
  'public/all-words.json',
  'public/forty-articles.json',
  'public/essay-materials.json',
]

const mojibakePattern = /(鍥涚骇|鍗曡瘝|鑳屽崟璇|浣滄枃|閫熸垚|棰勬祴|鈫|馃|锛|銆|涓€|鐨|瀛︿範)/
const replacementPattern = /\uFFFD/
const badPhoneticPattern = /(蓹|瑟|蕣|藧|蓴|伞|忙[a-z]|[a-z]忙)/

function fail(message) {
  console.error(`✗ ${message}`)
  process.exitCode = 1
}

function pass(message) {
  console.log(`✓ ${message}`)
}

function assertNoEncodingNoise(file, raw) {
  if (replacementPattern.test(raw)) fail(`${file}: 含有替换字符 �`)
  if (mojibakePattern.test(raw)) fail(`${file}: 疑似中文乱码`)
}

function assertDictionary(data) {
  const entries = Object.entries(data)
  if (entries.length < 1000) fail('dictionary.json: 词条过少')

  const seen = new Set()
  for (const [word, entry] of entries) {
    if (!/^[a-z][a-z'-]*$/.test(word)) fail(`dictionary.json: 非法单词 key ${word}`)
    if (seen.has(word)) fail(`dictionary.json: 重复单词 ${word}`)
    seen.add(word)
    if (!entry?.m || String(entry.m).trim().length < 2) {
      fail(`dictionary.json: ${word} 缺少释义`)
    }
    if (entry?.p && !String(entry.p).startsWith('/')) {
      fail(`dictionary.json: ${word} 音标格式异常`)
    }
    if (entry?.p && badPhoneticPattern.test(String(entry.p))) {
      fail(`dictionary.json: ${word} 疑似音标乱码`)
    }
  }
}

function assertWordArray(file, data) {
  if (!Array.isArray(data)) return
  for (const item of data) {
    const word = item?.word ?? item?.id ?? 'unknown'
    const phonetic = item?.phonetic
    if (phonetic && badPhoneticPattern.test(String(phonetic))) {
      fail(`${file}: ${word} 疑似音标乱码`)
    }
  }
}

for (const file of checkedFiles) {
  const full = join(root, file)
  if (!existsSync(full)) {
    fail(`${file}: 不存在`)
    continue
  }
  const raw = await readFile(full, 'utf8')
  assertNoEncodingNoise(file, raw)
  if (file.endsWith('.json') || file.endsWith('.webmanifest')) {
    try {
      const data = JSON.parse(raw)
      if (file.endsWith('dictionary.json')) assertDictionary(data)
      assertWordArray(file, data)
      if (file.endsWith('forty-articles.json') && !data.articles?.length) {
        fail('forty-articles.json: articles 为空')
      }
      if (file.endsWith('essay-materials.json') && !data.templates?.length) {
        fail('essay-materials.json: templates 为空')
      }
    } catch (error) {
      fail(`${file}: JSON 解析失败 ${error.message}`)
    }
  }
  pass(`${file}: 编码和结构正常`)
}

if (process.exitCode) process.exit(process.exitCode)
