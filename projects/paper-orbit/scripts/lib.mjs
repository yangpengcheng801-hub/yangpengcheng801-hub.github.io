import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const BACKEND = join(ROOT, 'backend')
export const FRONTEND = join(ROOT, 'frontend')
export const MIRROR = 'https://pypi.tuna.tsinghua.edu.cn/simple'
export const MIRROR_HOST = 'pypi.tuna.tsinghua.edu.cn'
export const NPM_REGISTRY = 'https://registry.npmmirror.com'

export const PIP_MIRROR_ARGS = ['-i', MIRROR, '--trusted-host', MIRROR_HOST]

export function npmInstallArgs() {
  return ['install', `--registry=${NPM_REGISTRY}`]
}

export function run(cmd, args, options = {}) {
  const isExecutablePath = /[\\/]/.test(cmd) || cmd.toLowerCase().endsWith('.exe')
  const useShell = options.shell ?? (process.platform === 'win32' && !isExecutablePath)
  const result = spawnSync(cmd, args, {
    stdio: 'inherit',
    shell: useShell,
    ...options,
  })
  return result.status ?? 1
}

export function findPython() {
  if (process.platform === 'win32') {
    const py = spawnSync('py', ['-3', '--version'], { encoding: 'utf8', shell: true })
    if (py.status === 0) return ['py', '-3']
  }
  for (const cmd of ['python3', 'python']) {
    const check = spawnSync(cmd, ['--version'], { encoding: 'utf8', shell: true })
    if (check.status === 0) return [cmd]
  }
  return null
}

export function venvPythonPath() {
  const win = join(BACKEND, '.venv', 'Scripts', 'python.exe')
  const unix = join(BACKEND, '.venv', 'bin', 'python')
  if (existsSync(win)) return win
  if (existsSync(unix)) return unix
  return null
}

export function ensureEnvFile() {
  const envPath = join(BACKEND, '.env')
  const examplePath = join(BACKEND, '.env.example')
  if (existsSync(envPath)) return true
  if (!existsSync(examplePath)) {
    console.error('[错误] 缺少 backend/.env.example')
    return false
  }
  copyFileSync(examplePath, envPath)
  console.log('\n已生成 backend/.env，请填写 LLM_API_KEY 后重新运行 npm run dev\n')
  return false
}
