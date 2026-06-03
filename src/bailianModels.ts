/**
 * 阿里云百炼 OpenAI 兼容接口文本对话模型（中国大陆北京地域）
 * 参考：https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope
 * 按推荐优先级排列；不可用或额度用尽时依次尝试下一个。
 */
export const BAILIAN_CHAT_MODELS: readonly string[] = [
  // 通义千问 · 常用别名（优先）
  'qwen-plus-latest',
  'qwen-flash',
  'qwen-turbo-latest',
  'qwen-max-latest',
  'qwen-long-latest',
  'qwen-plus',
  'qwen-turbo',
  'qwen-max',
  'qwen-long',
  // Qwen3 旗舰
  'qwen3.7-max',
  'qwen3.7-max-2026-05-20',
  'qwen3.6-max-preview',
  'qwen3-max',
  'qwen3-max-preview',
  'qwen3-max-2025-09-23',
  // Qwen3.6 / 3.5 Plus & Flash
  'qwen3.6-plus',
  'qwen3.6-plus-2026-04-02',
  'qwen3.5-plus',
  'qwen3.5-plus-2026-02-15',
  'qwen3.6-flash',
  'qwen3.6-flash-2026-04-16',
  'qwen3.5-flash',
  'qwen3.5-flash-2026-02-23',
  'qwen-flash-2025-07-28',
  'qwen-turbo-2024-11-01',
  'qwen-plus-2024-12-20',
  'qwen-max-2024-04-28',
  'qwen-max-2025-01-25',
  'qwen-long-2025-01-25',
  // Coder（兼容文本生成）
  'qwen3-coder-plus',
  'qwen3-coder-plus-2025-07-22',
  'qwen3-coder-flash',
  'qwen3-coder-flash-2025-07-28',
  'qwen-coder-plus',
  'qwen-coder-plus-latest',
  'qwen-coder-plus-2024-11-06',
  'qwen-coder-turbo',
  'qwen-coder-turbo-latest',
  'qwen-coder-turbo-2024-09-19',
  // QwQ / 数学（可作兜底）
  'qwq-plus',
  'qwq-plus-latest',
  'qwq-plus-2025-03-05',
  'qwq-32b',
  'qwen-math-plus',
  'qwen-math-plus-latest',
  'qwen-math-turbo',
  'qwen-math-turbo-latest',
  // Qwen3 开源规格
  'qwen3.6-35b-a3b',
  'qwen3.5-397b-a17b',
  'qwen3.5-122b-a10b',
  'qwen3.5-35b-a3b',
  'qwen3.5-27b',
  'qwen3-next-80b-a3b-instruct',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-235b-a22b',
  'qwen3-235b-a22b-instruct-2507',
  'qwen3-235b-a22b-thinking-2507',
  'qwen3-32b',
  'qwen3-30b-a3b',
  'qwen3-30b-a3b-instruct-2507',
  'qwen3-30b-a3b-thinking-2507',
  'qwen3-14b',
  'qwen3-8b',
  'qwen3-4b',
  'qwen3-1.7b',
  'qwen3-0.6b',
  // Qwen2.5
  'qwen2.5-72b-instruct',
  'qwen2.5-32b-instruct',
  'qwen2.5-14b-instruct',
  'qwen2.5-7b-instruct',
  'qwen2.5-14b-instruct-1m',
  'qwen2.5-7b-instruct-1m',
  'qwen2.5-math-72b-instruct',
  'qwen2.5-math-7b-instruct',
  'qwen2.5-coder-32b-instruct',
  'qwen2.5-coder-14b-instruct',
  'qwen2.5-coder-7b-instruct',
  'codeqwen1.5-7b-chat',
] as const

export const STORAGE_LAST_AI_MODEL = 'cet4_ai_model_v1'
const STORAGE_FAILED_MODELS = 'cet4_ai_failed_models_v1'
/** 近期失败的模型暂时跳过，避免每次刷新串行重试 */
const FAILED_MODEL_TTL_MS = 30 * 60 * 1000

type FailedModelMap = Record<string, number>

function loadFailedModels(): FailedModelMap {
  try {
    const raw = sessionStorage.getItem(STORAGE_FAILED_MODELS)
    if (!raw) return {}
    return JSON.parse(raw) as FailedModelMap
  } catch {
    return {}
  }
}

function saveFailedModels(map: FailedModelMap) {
  try {
    sessionStorage.setItem(STORAGE_FAILED_MODELS, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

/** 记录不可用/额度用尽的模型，一段时间内不再尝试 */
export function markModelFailed(model: string) {
  const map = loadFailedModels()
  map[model] = Date.now()
  const now = Date.now()
  for (const [id, at] of Object.entries(map)) {
    if (now - at > FAILED_MODEL_TTL_MS) delete map[id]
  }
  saveFailedModels(map)
}

function isModelRecentlyFailed(model: string): boolean {
  const at = loadFailedModels()[model]
  if (!at) return false
  if (Date.now() - at > FAILED_MODEL_TTL_MS) return false
  return true
}

/** 构建模型尝试顺序：上次成功的优先，跳过近期失败的，再遍历百炼列表 */
export function buildModelFallbackList(): string[] {
  const envModel = (import.meta.env.VITE_AI_MODEL as string | undefined)?.trim()
  const lastModel =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem(STORAGE_LAST_AI_MODEL)?.trim()
      : ''

  const start = lastModel || envModel || 'qwen-plus'
  const pool: string[] = []

  const push = (m: string) => {
    if (!m || pool.includes(m) || isModelRecentlyFailed(m)) return
    pool.push(m)
  }

  push(start)
  if (envModel) push(envModel)
  for (const m of BAILIAN_CHAT_MODELS) push(m)

  // 若全被标记失败，仍至少保留首选，避免无模型可试
  if (!pool.length) {
    return [start, envModel, ...BAILIAN_CHAT_MODELS].filter(
      (m, i, a): m is string => !!m && a.indexOf(m) === i,
    )
  }

  return pool
}

export function saveLastWorkingModel(model: string) {
  try {
    localStorage.setItem(STORAGE_LAST_AI_MODEL, model)
  } catch {
    /* ignore */
  }
}

export function getLastWorkingModel(): string {
  try {
    const last = localStorage.getItem(STORAGE_LAST_AI_MODEL)?.trim()
    if (last) return last
  } catch {
    /* ignore */
  }
  return (import.meta.env.VITE_AI_MODEL as string | undefined)?.trim() || 'qwen-plus'
}

/** 模型不存在、额度用尽、限流等 → 换下一个模型重试 */
export function isRetryableModelError(status: number, message: string): boolean {
  const m = message.toLowerCase()
  if ([402, 403, 404, 429, 503].includes(status)) return true
  if (
    /model|模型/.test(m) &&
    /(not\s*found|不存在|无效|不可用|not\s*exist|unknown|unsupported|does not exist|未开通|无权限)/i.test(
      m,
    )
  ) {
    return true
  }
  if (
    /quota|额度|用尽|不足|余额|欠费|insufficient|ratelimit|rate\s*limit|throttl|limit\s*exceeded|too\s*many\s*requests|exceeded/i.test(
      m,
    )
  ) {
    return true
  }
  if (/access\s*denied|permission|forbidden|service\s*unavailable/i.test(m)) {
    return true
  }
  return false
}
