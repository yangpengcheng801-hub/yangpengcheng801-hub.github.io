/**
 * 生产服务器：托管 dist 静态文件 + AI / 词典 API 代理
 * 用于 Render、Railway 等「一直在线」部署
 */
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
import { proxyDictLookup, proxyOpenAiChat } from '../api/_lib/proxy-handlers.mjs'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const root = join(__dirname, '..', 'dist')
const port = Number(process.env.PORT) || 4173

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

async function serveStatic(pathname) {
  let file = join(root, pathname === '/' ? 'index.html' : pathname)
  if (!existsSync(file) && !extname(pathname)) {
    file = join(root, 'index.html')
  }
  if (!existsSync(file)) return null
  const data = await readFile(file)
  return { data, type: MIME[extname(file)] || 'application/octet-stream' }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

    if (url.pathname === '/api/openai/v1/chat/completions' && req.method === 'POST') {
      const body = await readBody(req)
      const { status, body: text } = await proxyOpenAiChat(body, req.headers)
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(text)
      return
    }

    if (url.pathname === '/api/dict/lookup' && req.method === 'GET') {
      const { status, body: text } = await proxyDictLookup(url.searchParams.get('q'))
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(text)
      return
    }

    const staticFile = await serveStatic(url.pathname)
    if (staticFile) {
      res.writeHead(200, { 'Content-Type': staticFile.type })
      res.end(staticFile.data)
      return
    }

    res.writeHead(404)
    res.end('Not Found')
  } catch (err) {
    res.writeHead(500)
    res.end(err instanceof Error ? err.message : 'Server Error')
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`cet4-app production server: http://0.0.0.0:${port}`)
})
