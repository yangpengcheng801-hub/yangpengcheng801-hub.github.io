import { proxyDictLookup } from '../_lib/proxy-handlers.mjs'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).end('Method Not Allowed')
    return
  }

  try {
    const { status, body } = await proxyDictLookup(req.query?.q)
    res.status(status).setHeader('Content-Type', 'application/json').end(body)
  } catch (err) {
    res
      .status(502)
      .setHeader('Content-Type', 'application/json')
      .end(
        JSON.stringify({
          error: err instanceof Error ? err.message : '词典代理失败',
        }),
      )
  }
}
