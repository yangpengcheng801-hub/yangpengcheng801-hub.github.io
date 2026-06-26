import { spawn } from 'node:child_process'
import { BACKEND, ensureEnvFile, venvPythonPath } from './lib.mjs'

if (!ensureEnvFile()) process.exit(1)

const venvPy = venvPythonPath()
if (!venvPy) {
  console.error('[错误] 后端虚拟环境不存在，请先运行: npm run setup')
  process.exit(1)
}

const child = spawn(
  venvPy,
  ['-m', 'uvicorn', 'main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'],
  { cwd: BACKEND, stdio: 'inherit' },
)

child.on('exit', (code) => process.exit(code ?? 1))
