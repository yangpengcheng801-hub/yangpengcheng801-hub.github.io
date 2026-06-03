import {
  buildModelFallbackList,
  isRetryableModelError,
  markModelFailed,
  saveLastWorkingModel,
} from './bailianModels'
import {
  buildChatRequestHeaders,
  PROXY_CHAT_PATH,
  resolveApiProxyUrl,
  resolveChatCompletionsUrl,
  shouldUseApiProxy,
} from './apiClient'
/** 单模型请求超时（失败应快速换下一个，不宜过长） */
const PER_MODEL_TIMEOUT_MS = 5_500
/** 单次例句最多换几个模型（足够兜底，又避免刷太久） */
const MAX_ATTEMPTS = 8
/** 单次例句总耗时上限 */
const MAX_TOTAL_MS = 22_000

export type ChatCompletionBody = {
  temperature?: number
  max_tokens?: number
  response_format?: { type: 'json_object' }
  messages: Array<{ role: string; content: string }>
}

export type ChatCompletionResult = {
  content: string
  model: string
  triedModels: string[]
}

function parseErrorMessage(data: unknown, status: number): string {
  const err = data as { error?: { message?: string } }
  return err.error?.message ?? `API ${status}`
}

/** 依次尝试百炼模型列表，直到成功或全部失败 */
export async function chatWithModelFallback(
  apiKey: string,
  body: ChatCompletionBody,
  signal?: AbortSignal,
  validateContent?: (content: string) => boolean,
): Promise<ChatCompletionResult> {
  const models = buildModelFallbackList()
  const triedModels: string[] = []
  let lastError = '所有模型均不可用'
  const startedAt = Date.now()

  for (const model of models) {
    if (triedModels.length >= MAX_ATTEMPTS) break
    if (Date.now() - startedAt > MAX_TOTAL_MS) break
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    triedModels.push(model)
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(() => controller.abort(), PER_MODEL_TIMEOUT_MS)

    try {
      const chatUrl = shouldUseApiProxy()
        ? resolveApiProxyUrl(PROXY_CHAT_PATH)
        : resolveChatCompletionsUrl()
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: buildChatRequestHeaders(apiKey),
        signal: controller.signal,
        body: JSON.stringify({ ...body, model }),
      })

      const data = (await res.json().catch(() => ({}))) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
      }

      if (!res.ok) {
        const msg = parseErrorMessage(data, res.status)
        lastError = `${model}: ${msg}`
        if (isRetryableModelError(res.status, msg)) {
          markModelFailed(model)
          continue
        }
        throw new Error(lastError)
      }

      const content = data.choices?.[0]?.message?.content ?? ''
      if (!content.trim()) {
        lastError = `${model}: 返回内容为空`
        continue
      }

      if (validateContent && !validateContent(content)) {
        lastError = `${model}: 返回内容未通过校验`
        continue
      }

      const usedModel =
        (data as { model?: string }).model?.trim() || model
      saveLastWorkingModel(usedModel)
      return { content, model: usedModel, triedModels }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        if (signal?.aborted) throw err
        lastError = `${model}: 请求超时`
        continue
      }
      const msg = err instanceof Error ? err.message : '网络错误'
      lastError = `${model}: ${msg}`
      if (isRetryableModelError(0, msg)) continue
      throw new Error(lastError)
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  throw new Error(lastError)
}
