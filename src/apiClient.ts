import { Capacitor } from '@capacitor/core'

const DEFAULT_OPENAI_BASE = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export const DICT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

export const PROXY_CHAT_PATH = '/api/openai/v1/chat/completions'
export const PROXY_DICT_PATH = '/api/dict/lookup'

/** 手机 APK / 平板安装包 */
export function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}

/** 可选：网页/APK 走远程部署的 /api 代理（一般 APK 不需要） */
export function getApiProxyBase(): string {
  const fromEnv = (import.meta.env.VITE_API_PROXY_BASE as string | undefined)?.trim()
  return fromEnv ? fromEnv.replace(/\/$/, '') : ''
}

/** 构建时写入 APK 的默认百炼 Key（见 .env.local） */
export function getBuiltinApiKey(): string {
  return (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? ''
}

function resolveOpenAiBaseUrl(): string {
  const fromEnv = (import.meta.env.VITE_OPENAI_BASE_URL as string | undefined)?.trim()
  return fromEnv || DEFAULT_OPENAI_BASE
}

export function resolveChatCompletionsUrl(): string {
  const base = resolveOpenAiBaseUrl().replace(/\/$/, '')
  return base.endsWith('/v1') ? `${base}/chat/completions` : `${base}/v1/chat/completions`
}

/**
 * 是否走服务端 /api 代理：
 * - 开发浏览器 → 代理
 * - APK → 默认直连百炼（手机联网即可）
 * - 网页生产 → 同源代理
 * - 显式配置 VITE_API_PROXY_BASE → 走远程代理
 */
export function shouldUseApiProxy(): boolean {
  if (getApiProxyBase()) return true
  if (import.meta.env.DEV && !isNativeApp()) return true
  return false
}

/** AI / 词典接口在当前环境是否可发起请求 */
export function isApiProxyAvailable(): boolean {
  return true
}

export function resolveApiProxyUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  const base = getApiProxyBase()
  return base ? `${base}${normalized}` : normalized
}

export function buildChatRequestHeaders(apiKey: string): Record<string, string> {
  if (shouldUseApiProxy()) {
    return {
      'Content-Type': 'application/json',
      'X-OpenAI-Key': apiKey,
    }
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  }
}

export function resolveYoudaoDictUrl(word: string): string {
  return `https://dict.youdao.com/jsonapi?q=${encodeURIComponent(word)}&doctype=json`
}

export function apiProxyUnavailableMessage(): string {
  if (isNativeApp()) {
    return '未检测到内置 API Key，请用 .env.local 配置后重新打包 APK'
  }
  return '服务端 API 不可用，请确认已部署 /api 代理或使用 npm run dev'
}
