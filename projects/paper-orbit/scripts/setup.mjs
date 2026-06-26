import { copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { BACKEND, FRONTEND, PIP_MIRROR_ARGS, findPython, npmInstallArgs, run, venvPythonPath } from './lib.mjs'

const python = findPython()
if (!python) {
  console.error('[错误] 未找到 Python，请先安装 Python 3.10+')
  process.exit(1)
}

let venvPy = venvPythonPath()
if (!venvPy) {
  console.log('[1/3] 创建 Python 虚拟环境...')
  if (run(python[0], [...python.slice(1), '-m', 'venv', '.venv'], { cwd: BACKEND }) !== 0) {
    console.error('[错误] 虚拟环境创建失败')
    process.exit(1)
  }
  venvPy = venvPythonPath()
}

if (!venvPy) {
  console.error('[错误] 找不到虚拟环境 Python')
  process.exit(1)
}

const pipFast = [
  '-m', 'pip', 'install',
  ...PIP_MIRROR_ARGS,
  '--prefer-binary',
  '--default-timeout', '120',
]

console.log('[2/3] 安装 PyTorch CPU（清华镜像，跳过 pip 升级）...')
if (run(venvPy, [...pipFast, 'torch'], { cwd: BACKEND }) !== 0) {
  process.exit(1)
}

console.log('[2/3] 安装其余后端依赖...')
if (run(venvPy, [...pipFast, '-r', 'requirements.txt'], { cwd: BACKEND }) !== 0) {
  console.error('[错误] pip 安装失败')
  process.exit(1)
}

console.log('[3/3] 安装前端依赖（npmmirror）...')
if (run('npm', npmInstallArgs(), { cwd: FRONTEND }) !== 0) {
  process.exit(1)
}

const envPath = join(BACKEND, '.env')
const examplePath = join(BACKEND, '.env.example')
if (!existsSync(envPath) && existsSync(examplePath)) {
  copyFileSync(examplePath, envPath)
  console.log('\n已生成 backend/.env，请填写 LLM_API_KEY\n')
}

console.log('[可选] 检查测试论文...')
run('node', ['scripts/generate-test-papers.mjs'], { cwd: join(BACKEND, '..') })

console.log('setup 完成。')
