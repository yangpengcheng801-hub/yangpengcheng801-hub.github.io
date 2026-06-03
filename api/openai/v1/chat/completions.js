import { proxyOpenAiChat } from '../../../_lib/proxy-handlers.mjs'

async function readRawBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body)
  }
  const chunks = []
  await new Promise((resolve, reject) => {
    req.on('data', (c) => chunks.push(c))
    req.on('end', resolve)
    req.on('error', reject)
  })
  return Buffer.concat(chunks).toString()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed')
    return
  }

  try {
    const body = await readRawBody(req)
    const { status, body: text } = await proxyOpenAiChat(body, req.headers)
    res.status(status).setHeader('Content-Type', 'application/json').end(text)
  } catch (err) {
    res
      .status(502)
      .setHeader('Content-Type', 'application/json')
      .end(
        JSON.stringify({
          error: { message: err instanceof Error ? err.message : '代理请求失败' },
        }),
      )
  }
}
