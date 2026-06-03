import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

function resolveChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
}

/** 开发 / 预览服务器 AI 代理，默认对接阿里云百炼兼容模式 */
export function openaiProxyPlugin(): Plugin {
  const attach = (
    middlewares: {
      use: (
        path: string,
        handler: (
          req: import('http').IncomingMessage,
          res: import('http').ServerResponse,
        ) => void,
      ) => void
    },
    envDir: string,
    mode: string,
  ) => {
    middlewares.use('/api/openai/v1/chat/completions', async (req, res) => {
      if (req.method !== 'POST') {
        res.statusCode = 405
        res.end('Method Not Allowed')
        return
      }

      const env = loadEnv(mode, envDir, '')

      const apiKey =
        (req.headers['x-openai-key'] as string | undefined) ||
        env.OPENAI_API_KEY ||
        env.VITE_OPENAI_API_KEY ||
        env.DASHSCOPE_API_KEY ||
        ''

      if (!apiKey) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: { message: '未配置 API Key' } }))
        return
      }

      const baseUrl =
        env.VITE_OPENAI_BASE_URL ||
        env.OPENAI_BASE_URL ||
        'https://dashscope.aliyuncs.com/compatible-mode/v1'

      try {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const body = Buffer.concat(chunks).toString()

        const upstream = await fetch(resolveChatUrl(baseUrl), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body,
        })

        const text = await upstream.text()
        res.statusCode = upstream.status
        res.setHeader('Content-Type', 'application/json')
        res.end(text)
      } catch (err) {
        res.statusCode = 502
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            error: { message: err instanceof Error ? err.message : '代理请求失败' },
          }),
        )
      }
    })
  }

  return {
    name: 'openai-proxy',
    configureServer(server) {
      attach(server.middlewares, server.config.envDir || process.cwd(), server.config.mode)
    },
    configurePreviewServer(server) {
      attach(server.middlewares, server.config.envDir || process.cwd(), server.config.mode)
    },
  }
}

const DICT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function attachDictLookupMiddleware(
  middlewares: { use: (path: string, handler: (req: import('http').IncomingMessage, res: import('http').ServerResponse) => void) => void },
) {
  middlewares.use('/api/dict/lookup', async (req, res) => {
    if (req.method !== 'GET') {
      res.statusCode = 405
      res.end('Method Not Allowed')
      return
    }

    const url = new URL(req.url ?? '', 'http://localhost')
    const q = url.searchParams.get('q')?.trim()
    if (!q || !/^[a-zA-Z'-]+$/.test(q)) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'invalid query' }))
      return
    }

    try {
      const upstream = await fetch(
        `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}&doctype=json`,
        { headers: { 'User-Agent': DICT_UA } },
      )
      const text = await upstream.text()
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.end(text)
    } catch (err) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(
        JSON.stringify({
          error: err instanceof Error ? err.message : '词典代理失败',
        }),
      )
    }
  })
}

/** 开发服务器词典代理（有道英汉） */
export function dictProxyPlugin(): Plugin {
  return {
    name: 'dict-proxy',
    configureServer(server) {
      attachDictLookupMiddleware(server.middlewares)
    },
    configurePreviewServer(server) {
      attachDictLookupMiddleware(server.middlewares)
    },
  }
}
