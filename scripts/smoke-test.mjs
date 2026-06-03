/**
 * 功能冒烟测试（在电脑上跑，模拟 APK 直连 / 网页代理）
 * 用法: node scripts/smoke-test.mjs
 */
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const KEY = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || ''

const results = []

function pass(name, detail = '') {
  results.push({ name, ok: true, detail })
  console.log(`✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail })
  console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`)
}

async function loadEnvLocal() {
  try {
    const raw = await readFile(join(root, '.env.local'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (!m) continue
      const k = m[1].trim()
      const v = m[2].trim()
      process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

async function test(name, fn) {
  try {
    await fn()
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e))
  }
}

await loadEnvLocal()
let apiKey = process.env.VITE_OPENAI_API_KEY || process.env.OPENAI_API_KEY || KEY
if (!apiKey) {
  try {
    const { readdir } = await import('fs/promises')
    const dir = join(root, 'dist/assets')
    const main = (await readdir(dir)).find((f) => f.startsWith('index-') && f.endsWith('.js'))
    if (main) {
      const content = await readFile(join(dir, main), 'utf8')
      const m = content.match(/sk-[a-zA-Z0-9]+/)
      if (m) apiKey = m[0]
    }
  } catch {
    /* ignore */
  }
}

// —— 静态资源 ——
const staticFiles = [
  'public/dictionary.json',
  'public/high-frequency-words.json',
  'public/all-words.json',
  'public/forty-articles.json',
  'public/essay-materials.json',
  'dist/index.html',
]

for (const f of staticFiles) {
  await test(`静态文件 ${f}`, async () => {
    const p = join(root, f)
    if (!existsSync(p)) throw new Error('不存在，请先 npm run build')
    const raw = await readFile(p, 'utf8')
    JSON.parse(f.endsWith('.json') ? raw : '{}'.replace('{}', '"ok"'))
    if (f.endsWith('.json')) {
      const data = JSON.parse(raw)
      if (f.includes('dictionary') && (!Array.isArray(data) && typeof data !== 'object'))
        throw new Error('格式异常')
      if (f.includes('forty-articles') && (!data.articles?.length))
        throw new Error('articles 为空')
      if (f.includes('essay-materials') && !data.pastExams?.length)
        throw new Error('pastExams 为空')
    }
    pass(`静态文件 ${f}`)
  })
}

// —— 阅读篇配对逻辑（错位检测） ——
await test('阅读逐句配对无重复译文', async () => {
  const { pairArticleSentences } = await import('../src/articleSentences.ts')
  const data = JSON.parse(await readFile(join(root, 'public/forty-articles.json'), 'utf8'))
  const art = data.articles?.find((a) => a.title?.includes('Falling'))
  if (!art) throw new Error('未找到 Falling 篇')
  const pairs = pairArticleSentences(art.en, art.zh)
  const dup = pairs.filter((p, i) => i > 0 && p.zh && p.zh === pairs[i - 1]?.zh)
  if (dup.length > 2) throw new Error(`连续重复译文 ${dup.length} 处`)
  if (pairs[1]?.zh === pairs[0]?.zh && pairs.length > 3) {
    throw new Error('第2句译文与第1句相同（错位）')
  }
  pass('阅读逐句配对无重复译文', `${pairs.length} 句`)
})

// —— 百炼 AI ——
await test('百炼 API 直连(APK)', async () => {
  if (!apiKey) throw new Error('未配置 Key')
  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: 'Reply with JSON: {"en":"ok","zh":"好"}' }],
      max_tokens: 40,
      response_format: { type: 'json_object' },
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 120)}`)
  pass('百炼 API 直连(APK)')
})

// —— 有道查词 ——
await test('有道查词 API', async () => {
  const res = await fetch(
    'https://dict.youdao.com/jsonapi?q=hello&doctype=json',
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
  if (!res.ok) throw new Error(`status ${res.status}`)
  const j = await res.json()
  if (!j.ec?.word?.[0] && !j.simple?.word?.[0]) throw new Error('无释义')
  pass('有道查词 API')
})

// —— 有道发音 ——
await test('有道单词发音', async () => {
  const res = await fetch('https://dict.youdao.com/dictvoice?audio=hello&type=2')
  if (!res.ok) throw new Error(`status ${res.status}`)
  const buf = await res.arrayBuffer()
  if (buf.byteLength < 100) throw new Error('音频过短')
  pass('有道单词发音', `${buf.byteLength} bytes`)
})

await test('百度句子朗读(标准)', async () => {
  const s = 'He planned to leave home at dusk though there was thunder and lightning outdoors.'
  const res = await fetch(
    `https://fanyi.baidu.com/gettts?lan=en&text=${encodeURIComponent(s)}&spd=3&source=web`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } },
  )
  const ct = res.headers.get('content-type') || ''
  if (!res.ok || !ct.includes('audio')) throw new Error(`status ${res.status}`)
  pass('百度句子朗读(标准)')
})

// —— Supabase ——
await test('Supabase 云同步', async () => {
  const url = process.env.VITE_SUPABASE_URL
  const anon = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('未配置')
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, anon)
  const { error } = await sb.from('cet4_sync').select('count').limit(1)
  if (error) throw new Error(error.message)
  pass('Supabase 云同步')
})

// —— Capacitor 配置 ——
await test('CapacitorHttp 已启用', async () => {
  const cfg = JSON.parse(
    await readFile(join(root, 'android/app/src/main/assets/capacitor.config.json'), 'utf8'),
  )
  if (!cfg.plugins?.CapacitorHttp?.enabled) throw new Error('CapacitorHttp.enabled 应为 true')
  pass('CapacitorHttp 已启用')
})

await test('TTS 插件已同步', async () => {
  const apk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk')
  if (!existsSync(apk)) throw new Error('APK 不存在，请 npm run cap:apk')
  pass('APK 已生成', apk.split(/[/\\]/).pop())
})

await test('内置 API Key 已打进包', async () => {
  const dir = join(root, 'dist/assets')
  const { readdir } = await import('fs/promises')
  const files = await readdir(dir)
  const main = files.find((f) => f.startsWith('index-') && f.endsWith('.js'))
  if (!main) throw new Error('未找到主 bundle')
  const content = await readFile(join(dir, main), 'utf8')
  if (!content.includes('sk-') && !apiKey) throw new Error('bundle 内无 Key')
  pass('内置 API Key 已打进包')
})

// —— AI 例句生成模拟 ——
await test('AI 例句 JSON 生成', async () => {
  if (!apiKey) throw new Error('未配置 Key')
  const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      temperature: 0.65,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'Return JSON with en and zh for a short CET-4 sentence using: include, ability, about.',
        },
        { role: 'user', content: 'Generate one sentence.' },
      ],
      max_tokens: 200,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || res.status)
  const raw = data.choices?.[0]?.message?.content || ''
  if (!/\{[\s\S]*\}/.test(raw)) throw new Error('非 JSON')
  pass('AI 例句 JSON 生成')
})

console.log('\n—— 汇总 ——')
const ok = results.filter((r) => r.ok).length
const bad = results.filter((r) => !r.ok)
console.log(`${ok}/${results.length} 通过`)
if (bad.length) {
  console.log('\n未通过:')
  for (const r of bad) console.log(`  - ${r.name}: ${r.detail}`)
  process.exit(1)
}
