/** Vercel / 生产服务器共用的 API 代理 */

const DICT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function resolveChatUrl(baseUrl) {
  const base = baseUrl.replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
}

function resolveApiKey(headers = {}) {
  return (
    headers['x-openai-key'] ||
    headers['X-OpenAI-Key'] ||
    process.env.OPENAI_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    process.env.DASHSCOPE_API_KEY ||
    ''
  )
}

function resolveBaseUrl() {
  return (
    process.env.VITE_OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  )
}

export async function proxyOpenAiChat(body, headers = {}) {
  const apiKey = resolveApiKey(headers)
  if (!apiKey) {
    return { status: 401, body: JSON.stringify({ error: { message: '未配置 API Key' } }) }
  }

  const upstream = await fetch(resolveChatUrl(resolveBaseUrl()), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  })

  return { status: upstream.status, body: await upstream.text() }
}

export async function proxyDictLookup(word) {
  const q = String(word ?? '').trim()
  if (!q || !/^[a-zA-Z'-]+$/.test(q)) {
    return { status: 400, body: JSON.stringify({ error: 'invalid query' }) }
  }

  const upstream = await fetch(
    `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(q)}&doctype=json`,
    { headers: { 'User-Agent': DICT_UA } },
  )

  return { status: upstream.status, body: await upstream.text() }
}
