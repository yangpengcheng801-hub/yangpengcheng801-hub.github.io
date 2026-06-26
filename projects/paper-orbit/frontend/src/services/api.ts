import axios, { AxiosError } from 'axios'
import type {
  ChapterOutline,
  ChatApiResponse,
  ChatMessage,
  DocumentChunk,
  KnowledgeResponse,
  PaperSummary,
  UploadResponse,
} from '@/types'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api',
  timeout: 180_000,
})

interface ApiErrorBody {
  code?: string
  message?: string
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code = 'REQUEST_FAILED',
    public readonly status = 0,
  ) {
    super(message)
  }
}

client.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    const body = error.response?.data
    return Promise.reject(new ApiError(
      body?.message ?? error.message ?? '请求失败，请检查后端服务',
      body?.code,
      error.response?.status,
    ))
  },
)

export async function uploadPaper(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<UploadResponse> {
  const data = new FormData()
  data.append('file', file)
  const response = await client.post<UploadResponse>('/upload', data, {
    onUploadProgress: (event) => {
      if (!event.total || !onProgress) return
      onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)))
    },
  })
  return response.data
}

export async function listPapers(): Promise<PaperSummary[]> {
  const response = await client.get<PaperSummary[]>('/papers')
  return response.data
}

export async function deletePaper(paperId: string): Promise<void> {
  await client.delete(`/paper/${paperId}`)
}

export async function getStructure(paperId: string): Promise<string[]> {
  const response = await client.get<string[]>(`/paper/${paperId}/structure`)
  return response.data
}

export async function getOutline(paperId: string): Promise<ChapterOutline[]> {
  const response = await client.get<ChapterOutline[]>(`/paper/${paperId}/outline`)
  return response.data
}

export async function getPaperFile(paperId: string): Promise<Blob> {
  const response = await client.get<Blob>(`/paper/${paperId}/file`, { responseType: 'blob' })
  return response.data
}

export async function getKnowledge(paperId: string): Promise<KnowledgeResponse> {
  const response = await client.get<KnowledgeResponse>(`/paper/${paperId}/knowledge`)
  return response.data
}

export async function askPaper(
  paperId: string,
  query: string,
  history: ChatMessage[],
): Promise<ChatApiResponse> {
  const cleanHistory = history
    .filter((message) => !message.pending)
    .slice(-12)
    .map(({ role, content }) => ({ role, content }))
  const response = await client.post<ChatApiResponse>(`/paper/${paperId}/chat`, {
    query,
    history: cleanHistory,
    top_k: 4,
  })
  return response.data
}

function buildChatHistory(history: ChatMessage[]): Array<{ role: string; content: string }> {
  return history
    .filter((message) => !message.pending)
    .slice(-12)
    .map(({ role, content }) => ({ role, content }))
}

export async function askPaperStream(
  paperId: string,
  query: string,
  history: ChatMessage[],
  onToken: (token: string) => void,
): Promise<string> {
  const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'
  const response = await fetch(`${baseURL}/paper/${paperId}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      history: buildChatHistory(history),
      top_k: 4,
    }),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new ApiError(text || '流式问答失败', 'STREAM_FAILED', response.status)
  }
  const reader = response.body?.getReader()
  if (!reader) throw new ApiError('浏览器不支持流式响应', 'STREAM_UNSUPPORTED')

  const decoder = new TextDecoder()
  let buffer = ''
  let answer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const payload = JSON.parse(line.slice(6)) as {
        token?: string
        done?: boolean
        answer?: string
        error?: string
      }
      if (payload.error) throw new ApiError(payload.error, 'STREAM_ERROR')
      if (payload.token) {
        answer += payload.token
        onToken(payload.token)
      }
      if (payload.done && payload.answer) answer = payload.answer
    }
  }
  return answer
}

export async function getChunk(paperId: string, chunkId: string): Promise<DocumentChunk> {
  const response = await client.get<DocumentChunk>(`/paper/${paperId}/chunk/${chunkId}`)
  return response.data
}
