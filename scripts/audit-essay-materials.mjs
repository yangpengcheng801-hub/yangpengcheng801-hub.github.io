/**
 * 调用百炼大模型审核并修正 essay-materials.json 中的作文与句型内容
 * 用法: node scripts/audit-essay-materials.mjs [--force] [--limit N] [--only exams|mocks|templates|phrases]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvLocal, getApiKey, getBaseUrl } from './load-env.mjs'
import { resolveChatUrl } from './proxy-handlers.mjs'
import { applyTextFixesToPack, splitEssayParagraphs, countWords } from './essay-text-fix.mjs'
import { applyAuditToPack } from './essay-audit-merge.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, 'scripts', 'cache', 'essay-audit')
const outPath = join(root, 'public', 'essay-materials.json')

const MODEL = process.env.ESSAY_AUDIT_MODEL || 'qwen-plus'
const DELAY_MS = Number(process.env.ESSAY_AUDIT_DELAY_MS || 400)

loadEnvLocal()

const args = process.argv.slice(2)
const force = args.includes('--force')
const limitIdx = args.indexOf('--limit')
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null

mkdirSync(cacheDir, { recursive: true })

function cachePath(id) {
  return join(cacheDir, `${id.replace(/[^\w.-]/g, '_')}.json`)
}

function readCache(id) {
  const p = cachePath(id)
  if (!force && existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf8'))
    } catch {
      /* ignore */
    }
  }
  return null
}

function writeCache(id, data) {
  writeFileSync(cachePath(id), JSON.stringify(data, null, 2), 'utf8')
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function extractJson(text) {
  const raw = String(text ?? '').trim()
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fence ? fence[1].trim() : raw
  try {
    return JSON.parse(body)
  } catch {
    const start = body.indexOf('{')
    const end = body.lastIndexOf('}')
    if (start >= 0 && end > start) return JSON.parse(body.slice(start, end + 1))
    throw new Error('无法解析 JSON: ' + body.slice(0, 200))
  }
}

async function chat(system, user) {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('未配置 API Key，请在 .env.local 设置 OPENAI_API_KEY')

  const res = await fetch(resolveChatUrl(getBaseUrl()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  const text = await res.text()
  if (!res.ok) throw new Error(`API ${res.status}: ${text.slice(0, 300)}`)

  const data = JSON.parse(text)
  const content = data.choices?.[0]?.message?.content
  return extractJson(content)
}

const ESSAY_SYSTEM = `你是大学英语四级(CET-4)作文审校专家。修正从旧版 Word 文档解析出的英文作文/范文中的错误，包括：
- 拼写、语法、标点、大小写
- 段落划分（用 \\n\\n 分隔段）
- 删除混入正文的题号、中文提纲、页眉页脚、乱码
- 保持四级作文难度与篇幅，不要过度改写；只修错误和明显不通顺处
- 不要添加与原文无关的新论点

严格输出 JSON：
{
  "titleEn": "英文标题或空字符串",
  "essay": "完整修正后正文，段间用双换行",
  "changes": "简要说明修改点（中文，一两句）"
}`

const PHRASE_SYSTEM = `你是 CET-4 英语写作句型审校专家。修正套语句型库中的英中对照条目。
- 修正英文拼写语法；中文释义准确简洁
- 删除非句型内容（章节标题、残缺句）
- 保留模板占位符如 … / sb. / sth.

严格输出 JSON：
{
  "items": [{"en":"...", "zh":"..."}],
  "changes": "简要说明"
}`

const TEMPLATE_SYSTEM = `你是 CET-4 作文模板审校专家。修正范文样例与填空练习中的英文。
- 保留 skeleton/fillIn 中的 _____ 占位符数量与位置
- 修正范文 sampleEssay；段落用 \\n\\n 分隔
- 不要改变模板教学结构

严格输出 JSON：
{
  "sampleEssay": "...",
  "sampleParagraphs": ["段1","段2"],
  "fillInBlocks": [{"label":"...", "content":"..."}],
  "changes": "简要说明"
}`

function essayKey(m, essay, index) {
  return essay.id || essay.label?.replace(/\s+/g, '-') || `essay-${index}`
}

async function auditEssay(id, meta, essay, titleEn) {
  const cached = readCache(id)
  if (cached) return cached

  const user = `【元信息】${meta}

【当前标题】${titleEn || '（无）'}

【待审校正文】
${essay}`

  const result = await chat(ESSAY_SYSTEM, user)
  const fixed = {
    id,
    titleEn: result.titleEn ?? titleEn,
    essay: result.essay ?? essay,
    essayParagraphs: splitEssayParagraphs(result.essay ?? essay),
    wordCount: countWords(result.essay ?? essay),
    changes: result.changes ?? '',
    auditedAt: new Date().toISOString(),
  }
  writeCache(id, fixed)
  await sleep(DELAY_MS)
  return fixed
}

async function auditPhrases(id, label, items) {
  const cached = readCache(id)
  if (cached) return cached

  const user = `【分类】${label}

【条目 JSON】
${JSON.stringify(items, null, 2)}`

  const result = await chat(PHRASE_SYSTEM, user)
  const fixed = {
    id,
    items: result.items ?? items,
    changes: result.changes ?? '',
    auditedAt: new Date().toISOString(),
  }
  writeCache(id, fixed)
  await sleep(DELAY_MS)
  return fixed
}

async function auditTemplate(id, tpl) {
  const cached = readCache(id)
  if (cached) return cached

  const user = `【模板】${tpl.label || tpl.id}

【范文】
${tpl.sampleEssay}

【填空块】
${JSON.stringify(tpl.fillInBlocks ?? [], null, 2)}`

  const result = await chat(TEMPLATE_SYSTEM, user)
  const essay = result.sampleEssay ?? tpl.sampleEssay
  const fixed = {
    id,
    sampleEssay: essay,
    sampleParagraphs: result.sampleParagraphs ?? splitEssayParagraphs(essay),
    fillInBlocks: result.fillInBlocks ?? tpl.fillInBlocks,
    changes: result.changes ?? '',
    auditedAt: new Date().toISOString(),
  }
  writeCache(id, fixed)
  await sleep(DELAY_MS)
  return fixed
}

async function main() {
  const raw = JSON.parse(readFileSync(outPath, 'utf8'))
  let data = applyTextFixesToPack(raw)

  const tasks = []
  let n = 0

  if (!only || only === 'templates') {
    for (const t of data.templates ?? []) {
      if (n >= limit) break
      tasks.push(async () => {
        console.log(`[模板] ${t.label || t.id}`)
        const r = await auditTemplate(`tpl-${t.id}`, t)
        if (r.changes) console.log(`  → ${r.changes}`)
      })
      n++
    }
  }

  if (!only || only === 'exams') {
    const auditedIds = new Set()
    for (const e of data.pastExams ?? []) {
      if (n >= limit || auditedIds.has(e.id)) continue
      auditedIds.add(e.id)
      tasks.push(async () => {
        console.log(`[真题] ${e.id} ${e.titleZh || e.titleEn}`)
        const r = await auditEssay(`exam-${e.id}`, `四级真题 ${e.year} ${e.session}`, e.essay, e.titleEn)
        if (r.changes) console.log(`  → ${r.changes}`)
      })
      n++
    }
  }

  if (!only || only === 'mocks') {
    for (const m of data.mockTests ?? []) {
      for (let i = 0; i < (m.essays ?? []).length; i++) {
        if (n >= limit) break
        const essay = m.essays[i]
        const key = essayKey(m, essay, i)
        tasks.push(async () => {
          console.log(`[预测] ${m.id} ${essay.title || essay.label}`)
          const r = await auditEssay(`mock-${m.id}-${key}`, m.topic, essay.body, essay.title)
          if (r.changes) console.log(`  → ${r.changes}`)
        })
        n++
      }
    }
  }

  if (!only || only === 'phrases') {
    const lib = data.phraseLibrary
    if (lib?.phraseSets?.sets) {
      for (const [key, set] of Object.entries(lib.phraseSets.sets)) {
        if (n >= limit) break
        tasks.push(async () => {
          console.log(`[句型] ${set.label}`)
          const r = await auditPhrases(`phrases-${key}`, set.label, set.items)
          if (r.changes) console.log(`  → ${r.changes}`)
        })
        n++
      }
    }
    if (n < limit && lib?.chartPhrases?.length) {
      tasks.push(async () => {
        console.log('[句型] 图表描述')
        const r = await auditPhrases('phrases-chart', '图表描述', lib.chartPhrases)
        if (r.changes) console.log(`  → ${r.changes}`)
      })
    }
  }

  console.log(`\n开始审核 ${tasks.length} 项 (model=${MODEL})...\n`)

  for (const run of tasks) {
    try {
      await run()
    } catch (err) {
      console.error('  ✗', err.message)
    }
  }

  data = applyAuditToPack(data)
  data.meta = {
    ...data.meta,
    auditedAt: new Date().toISOString(),
    auditModel: MODEL,
  }
  writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf8')
  console.log(`\n已写入 ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
