import { existsSync } from 'node:fs'
import { BACKEND, findPython, run } from './lib.mjs'

let ok = true

const py = findPython()
if (py) {
  console.log('[OK] Python:', py.join(' '))
} else {
  console.log('[X] 未找到 Python — 安装 3.10+ 并加入 PATH')
  console.log('    https://www.python.org/downloads/')
  ok = false
}

const npm = run('npm', ['--version'], { stdio: 'pipe' })
if (npm === 0) {
  console.log('[OK] npm')
} else {
  console.log('[X] 未找到 npm — 安装 Node.js LTS')
  console.log('    https://nodejs.org/')
  ok = false
}

if (existsSync(`${BACKEND}/.env`)) {
  console.log('[OK] backend/.env')
} else {
  console.log('[!] 缺少 backend/.env，运行 npm run setup 会自动从 .env.example 复制')
}

console.log('')
if (ok) {
  console.log('环境就绪。下一步:')
  console.log('  npm install')
  console.log('  npm run setup')
  console.log('  npm run dev')
} else {
  console.log('请先安装缺失软件，关闭终端后重试。')
  process.exit(1)
}
