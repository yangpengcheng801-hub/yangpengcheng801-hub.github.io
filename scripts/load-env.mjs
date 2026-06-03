import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadEnvLocal() {
  const path = join(root, '.env.local')
  if (!existsSync(path)) return
  const text = readFileSync(path, 'utf8')
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const key = t.slice(0, eq).trim()
    const val = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

export function getApiKey() {
  return (
    process.env.OPENAI_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    ''
  )
}

export function getBaseUrl() {
  return (
    process.env.VITE_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  )
}
