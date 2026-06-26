import { BACKEND, run, venvPythonPath } from './lib.mjs'

const venvPy = venvPythonPath()
if (!venvPy) {
  console.error('[错误] 请先运行 npm run setup 创建虚拟环境')
  process.exit(1)
}

const script = `${BACKEND}/../tools/generate_test_papers.py`.replace(/\\/g, '/')
if (run(venvPy, [script], { cwd: BACKEND }) !== 0) {
  process.exit(1)
}
