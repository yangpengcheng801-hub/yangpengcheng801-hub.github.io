import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'dist')
const STAGING = join(OUT_DIR, 'paper-orbit')
const ZIP_NAME = `paper-orbit-${new Date().toISOString().slice(0, 10)}.zip`

const SKIP_DIRS = new Set([
  'node_modules',
  '.venv',
  'dist',
  '.git',
  '__pycache__',
])

const SKIP_FILES = new Set([
  'backend/.env',
  'Thumbs.db',
  '.DS_Store',
])

function shouldSkip(relPath) {
  const normalized = relPath.replace(/\\/g, '/')
  if (SKIP_FILES.has(normalized)) return true
  if (normalized.endsWith('.tsbuildinfo')) return true
  if (normalized.endsWith('.log')) return true
  const parts = normalized.split('/')
  if (parts.some((part) => SKIP_DIRS.has(part))) return true
  if (normalized.startsWith('backend/data/uploads/') && !normalized.endsWith('.gitkeep')) return true
  if (normalized.startsWith('backend/data/papers/') && !normalized.endsWith('.gitkeep')) return true
  if (normalized.startsWith('backend/data/vector_db/') && !normalized.endsWith('.gitkeep')) return true
  return false
}

function copyTree(src, dest, base = src) {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name)
    const rel = relative(base, srcPath)
    if (shouldSkip(rel)) continue
    const destPath = join(dest, entry.name)
    if (entry.isDirectory()) {
      mkdirSync(destPath, { recursive: true })
      copyTree(srcPath, destPath, base)
    } else if (entry.isFile()) {
      mkdirSync(dirname(destPath), { recursive: true })
      copyFileSync(srcPath, destPath)
    }
  }
}

function zipWithPowerShell(sourceDir, zipPath) {
  const ps = [
    'Compress-Archive',
    `-Path '${sourceDir.replace(/'/g, "''")}\\*'`,
    `-DestinationPath '${zipPath.replace(/'/g, "''")}'`,
    '-Force',
  ].join(' ')
  const result = spawnSync(
    'powershell',
    ['-NoProfile', '-Command', ps],
    { stdio: 'inherit', shell: true },
  )
  return result.status === 0
}

mkdirSync(OUT_DIR, { recursive: true })
if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true })
mkdirSync(STAGING, { recursive: true })

console.log('[1/2] 复制项目到临时目录（排除 node_modules / .venv / 运行时数据）...')
copyTree(ROOT, STAGING, ROOT)

const envExample = join(STAGING, 'backend', '.env.example')
const envTarget = join(STAGING, 'backend', '.env')
if (!existsSync(envTarget) && existsSync(envExample)) {
  copyFileSync(envExample, envTarget)
  console.log('已附带 backend/.env（由 .env.example 生成，请填写 API Key）')
}

const zipPath = join(OUT_DIR, ZIP_NAME)
if (existsSync(zipPath)) rmSync(zipPath, { force: true })

console.log('[2/2] 生成压缩包...')
if (!zipWithPowerShell(STAGING, zipPath)) {
  console.error('[错误] 压缩失败')
  process.exit(1)
}

const sizeMb = (statSync(zipPath).size / (1024 * 1024)).toFixed(2)
console.log(`\n打包完成: ${zipPath}`)
console.log(`大小约 ${sizeMb} MB`)
console.log('\n可将此 zip 复制到其他电脑，解压后运行「一键安装.bat」→「一键启动.bat」')
