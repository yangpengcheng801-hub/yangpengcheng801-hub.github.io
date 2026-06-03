import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { asyncPool } from './asyncPool'
import { chatWithModelFallback } from './aiChat'
import {
  BAILIAN_CHAT_MODELS,
  getLastWorkingModel,
} from './bailianModels'
import {
  advanceDailyTaskByCount,
  DEFAULT_DAILY_TASK,
  fetchWordLibrary,
  getDailyTarget,
  LIBRARY_META,
  migrateLegacyStorage,
  readLibraryChoice,
  readOverview,
  storageKey,
  writeLibraryChoice,
  type DailyTask,
  type WordLibrary,
} from './wordLibrary'
import {
  applyCorrect,
  applyWrong,
  canAdvanceRound,
  computeLearningProgress,
  countMasteredFromStates,
  defaultWordState,
  getLearningQueue,
  initWordStates,
  isAllMastered,
  markMasteredState,
  migrateWordStates,
  TOTAL_ROUNDS,
  type LearningProgress,
  type WordLearningState,
} from './learningState'
import ArticlesTab from './ArticlesTab'
import EssaysTab from './EssaysTab'
import StatsTab from './StatsTab'
import WordsTab from './WordsTab'
import DictionaryPopup from './DictionaryPopup'
import { defaultExamDate, EXAM_DATE_KEY } from './examSchedule'
import { fetchExamSentenceForGroup } from './examSents'
import {
  sentenceCoversAllWords,
  validateSentenceCoverage,
  wordAppearsInSentence,
} from './sentenceCoverage'
import {
  advanceSrs,
  clearSrsEntries,
  formatNextReview,
  getAllSrsEntries,
  getDueSrsIds,
  getNextSrsEntry,
  getSrsEntry,
  recordSrsWrong,
  removeSrsEntry,
} from './spacedReview'
import { getStatsSummary, recordStudyEvent } from './studyStats'
import { getReminderEnabled, scheduleDailyReminder } from './reminders'
import {
  extractFirstPos,
  getCommonMeaningItems,
  getWordSentenceSenses,
  parseMeaningGroups,
  isCommonMeaningItem,
  isObscureMeaning,
  cleanMeaningItem,
  buildQuizOptionLabel,
  type WordSense,
} from './wordMeaning'
import StreakFlame, { readStreak } from './StreakFlame'
import ClickableSentence, { type WordTapInfo } from './ClickableSentence'
import { apiProxyUnavailableMessage, getBuiltinApiKey, isApiProxyAvailable, isNativeApp } from './apiClient'
import { getRicherMeaning, loadDictionary, lookupWord, type DictEntry } from './dictionary'
import { getOnlineDictEntry, lookupWordOnline } from './dictOnline'
import { exportBackupFile, importBackupFromFile, countBackupKeys } from './dataBackup'
import {
  disableCloudSync,
  enableCloudSync,
  getLastSyncLabel,
  getSyncCode,
  getLastSyncError,
  isCloudSyncConfigured,
  isSyncEnabled,
  runCloudSync,
  scheduleCloudPush,
} from './cloudSync'
import {
  autoSpeakWord,
  cancelAutoSpeak,
  getAccentPref,
  markSpeechUnlocked,
  setAccentPref,
  speakSentence,
  speakWord,
  warmUpSpeech,
  type AccentPref,
} from './speech'
import './App.css'

/* ===================== 类型定义 ===================== */
type Word = {
  id: string
  word: string
  pos: string
  meaning: string
  phonetic?: string
  /** 有道四级真题考频（越高越常考） */
  examFreq?: number
  examYear?: number
  freqRank?: number
}

type TabKey = 'learn' | 'review' | 'wrong' | 'words' | 'articles' | 'essays' | 'stats'
type DisplayMode = 'en' | 'zh' | 'both'

type CachedSentence = {
  en: string
  zh: string
  wordIds: string[]
  createdAt: number
  source: 'ai' | 'local' | 'exam'
  examSource?: string
  /** 例句生成规则版本，升级后旧缓存自动失效 */
  promptV?: number
  /** 各词本句采用的常考义下标（刷新时轮换） */
  senseIndices?: Record<string, number>
  /** 成功生成例句时使用的模型 */
  aiModel?: string
  /** AI 失败原因（本地兜底时展示） */
  genError?: string
}

type PickedSense = {
  wordId: string
  sense: WordSense
  senseIndex: number
}

type SentenceGroup = {
  key: string
  words: Word[]
}

type OptionItem = {
  id: string
  meaning: string
  isCorrect: boolean
}

/* ===================== 常量 ===================== */
const STORAGE = {
  mastered: 'mastered_v1',
  wrong: 'wrong_v1',
  displayMode: 'display_mode_v1',
  sentenceCache: 'sentence_cache_v1',
  learnIndex: 'learn_index_v1',
  dailyTask: 'daily_task_v1',
  wordStates: 'word_states_v1',
  learningProgress: 'learning_progress_v1',
  apiKey: 'cet4_openai_key_v1',
} as const

const DEFAULT_LEARNING_PROGRESS: LearningProgress = {
  currentRound: 1,
  totalRounds: TOTAL_ROUNDS,
  roundProgress: 0,
  totalWords: 0,
  masteredWords: 0,
  remainingWords: 0,
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000
/** 本地兜底例句仅短期展示，过期后自动重试 AI */
const LOCAL_FALLBACK_TTL = 5 * 60 * 1000
const GROUP_SIZE = 5
/** 同时生成例句的组数上限，避免触发百炼限流 */
const AI_SENTENCE_CONCURRENCY = 2
/** 复习/错词例句：每词只出现一次，刷新轮换义项；v4 强调语法自然 */
const SENTENCE_PROMPT_V = 4
const AI_PROVIDER = '阿里云百炼'
const MASTERED_PAGE_SIZE = 80

function AppToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, 5000)
    return () => window.clearTimeout(timer)
  }, [message, onDismiss])

  return (
    <div className="app-toast" role="status">
      <p className="app-toast-text">{message}</p>
      <button type="button" className="app-toast-close" onClick={onDismiss} aria-label="关闭">
        ✕
      </button>
    </div>
  )
}

function MasteredWordsModal({ words, onClose }: { words: Word[]; onClose: () => void }) {
  const [page, setPage] = useState(0)
  const totalPages = Math.max(1, Math.ceil(words.length / MASTERED_PAGE_SIZE))
  const safePage = Math.min(page, totalPages - 1)
  const slice = words.slice(
    safePage * MASTERED_PAGE_SIZE,
    (safePage + 1) * MASTERED_PAGE_SIZE,
  )

  return (
    <div className="app-sheet" onClick={onClose}>
      <div className="app-sheet-panel" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-800">已掌握单词</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-slate-400 card-press"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          共 {words.length} 个 · 第 {safePage + 1}/{totalPages} 页
        </p>
        <div className="flex flex-wrap gap-2">
          {slice.map((w) => (
            <span
              key={w.id}
              className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-800"
            >
              {w.word}
            </span>
          ))}
        </div>
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40 card-press"
            >
              上一页
            </button>
            <button
              type="button"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-40 card-press"
            >
              下一页
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const SYSTEM_PROMPT = `你是大学英语四级（CET-4）例句编写专家。用户会提供一组单词（最多 5 个）及每个词在本句中要用的义项与词性。

【语法与表达——最高优先级】
- 必须写一句完整、自然、符合现代英语语法的句子，读起来像母语者写的，可用于课堂或教材。
- 必须有清晰的主谓结构；时态、主谓一致、冠词、介词搭配正确。
- 禁止：把多个目标词用逗号简单罗列；无动词的词堆；中式英语；生硬堆砌；说明书式列举。
- 允许：一个完整复合句，或由一个连词连接的两个分句（仍算一句）；为容纳多词可适当使用定语从句、状语从句等，但逻辑要通顺。

【词汇要求】
- 句中须出现列表中的每一个单词，且每个词只出现一次（允许合理词形变化，如 run / ran / running）。
- 每个词必须按用户指定的义项和词性使用，不要用该词的其他义项。

【输出】
- 提供准确的中文翻译，与英文各词的指定义项一致。
- 严格输出 JSON，无其他文字：{"en": "...", "zh": "..."}`

function loadWordsFromJson(raw: unknown): Word[] {
  if (!Array.isArray(raw)) return []
  const result: Word[] = []
  for (const item of raw) {
    const w = item as {
      id?: string
      word?: string
      meaning?: string
      pos?: string
      phonetic?: string
      examFreq?: number
      examYear?: number
      freqRank?: number
    }
    const word = String(w.word ?? '').trim()
    const meaning = String(w.meaning ?? '').trim()
    if (!word || !meaning) continue
    const groups = parseMeaningGroups(meaning)
    const pos = String(w.pos ?? '').trim() || groups[0]?.pos || extractFirstPos(meaning)
    const entry: Word = {
      id: w.id ?? `xls-${word}`,
      word,
      meaning,
      pos,
    }
    if (w.phonetic?.trim()) entry.phonetic = w.phonetic.trim()
    if (typeof w.examFreq === 'number') entry.examFreq = w.examFreq
    if (typeof w.examYear === 'number') entry.examYear = w.examYear
    if (typeof w.freqRank === 'number') entry.freqRank = w.freqRank
    result.push(entry)
  }
  return result
}

function formatSenseForPrompt(s: WordSense): string {
  return s.pos ? `${s.pos} ${s.meaning}` : s.meaning
}

/** 为本句每个词选一个常考义；刷新时轮换到下一个义项 */
function pickSentenceSenses(
  words: Word[],
  prevIndices?: Record<string, number>,
  rotate = false,
): PickedSense[] {
  return words.map((w) => {
    const all = getWordSentenceSenses(w)
    let idx: number
    if (rotate && prevIndices && prevIndices[w.id] !== undefined && all.length > 1) {
      idx = (prevIndices[w.id] + 1) % all.length
    } else if (prevIndices && prevIndices[w.id] !== undefined) {
      idx = prevIndices[w.id] % all.length
    } else {
      idx = all.length > 1 ? Math.floor(Math.random() * all.length) : 0
    }
    return { wordId: w.id, sense: all[idx], senseIndex: idx }
  })
}

function buildSentenceUserPrompt(words: Word[], picks: PickedSense[], refresh = false): string {
  const lines = picks.map((p) => {
    const w = words.find((x) => x.id === p.wordId)!
    return `- ${w.word}：本句使用 ${formatSenseForPrompt(p.sense)}`
  })
  return `请写一句语法正确、自然流畅的英文句子及中文翻译（CET-4 水平，不要造病句或堆词）。
${refresh ? '（请换一种与之前不同的句式与场景。）\n' : ''}
硬性要求：
- 共 ${words.length} 个目标词，每个在句中只出现一次，且用法符合下方义项与词性。
- 句子必须是真人会说的正规英语，有主谓、时态正确，不要只把单词用逗号串在一起。

目标词及义项：
${lines.join('\n')}`
}

function picksToSenseIndices(picks: PickedSense[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const p of picks) out[p.wordId] = p.senseIndex
  return out
}

/** 选项：四级高频常考义 */
function buildQuizCorrectLabel(word: Word): string {
  return buildQuizOptionLabel(word)
}

function buildQuizDistractorLabel(word: Word): string {
  return buildQuizOptionLabel(word)
}

/* ===================== 工具函数 ===================== */
function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    if (key.startsWith('cet4_') || key === EXAM_DATE_KEY) {
      scheduleCloudPush()
    }
  } catch (e) {
    console.warn('[cet4] localStorage 写入失败', e)
  }
}

/** 读取 API Key：优先 localStorage，其次环境变量 */
function getApiKey(): string {
  const stored = localStorage.getItem(STORAGE.apiKey) ?? ''
  if (stored.trim()) return stored.trim()
  return (import.meta.env.VITE_OPENAI_API_KEY as string | undefined)?.trim() ?? ''
}

/** 从旧版数据迁移错词记录 */
function migrateOldWrongData(allWords: Word[]): Record<string, number> {
  try {
    const raw = localStorage.getItem('cet4_words_v3')
    if (!raw) return {}
    const words = JSON.parse(raw) as Array<{ id?: string; word: string; wrongCount?: number }>
    const wrong: Record<string, number> = {}
    const idByWord = new Map(allWords.map((w) => [w.word.toLowerCase(), w.id]))
    for (const w of words) {
      const count = w.wrongCount ?? 0
      if (count <= 0) continue
      const id =
        w.id && allWords.some((m) => m.id === w.id)
          ? w.id
          : idByWord.get(w.word.toLowerCase())
      if (id) wrong[id] = Math.max(wrong[id] ?? 0, count)
    }
    return wrong
  } catch {
    return {}
  }
}

function loadWrongMap(allWords: Word[], wrongKey: string): Record<string, number> {
  const current = loadJson<Record<string, number>>(wrongKey, {})
  const migrated = migrateOldWrongData(allWords)
  if (!Object.keys(migrated).length) return current
  const merged = { ...migrated, ...current }
  saveJson(wrongKey, merged)
  return merged
}

/** 将错词 ID 对齐到当前词库（兼容旧版 id / 单词文本） */
function resolveWordByIdOrLegacy(id: string, words: Word[]): Word | undefined {
  const byId = new Map(words.map((w) => [w.id, w]))
  const byWord = new Map(words.map((w) => [w.word.toLowerCase(), w]))
  const direct = byId.get(id)
  if (direct) return direct
  const asWord = byWord.get(id.toLowerCase())
  if (asWord) return asWord
  const stripped = id.replace(/^xls-/, '').toLowerCase()
  return byWord.get(stripped)
}

function normalizeWrongMap(
  wrongMap: Record<string, number>,
  words: Word[],
): Record<string, number> {
  const next: Record<string, number> = {}
  for (const [id, count] of Object.entries(wrongMap)) {
    if ((count ?? 0) <= 0) continue
    const w = resolveWordByIdOrLegacy(id, words)
    if (!w) continue
    next[w.id] = Math.max(next[w.id] ?? 0, count)
  }
  return next
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function chunkWords(words: Word[], size = GROUP_SIZE): Word[][] {
  const chunks: Word[][] = []
  for (let i = 0; i < words.length; i += size) {
    chunks.push(words.slice(i, i + size))
  }
  return chunks
}

function buildMasteredRecords(
  words: Word[],
  states: Record<string, WordLearningState>,
): Array<{ id: string; at: number }> {
  return words
    .filter((w) => states[w.word]?.status === 'mastered')
    .map((w) => ({
      id: w.id,
      at: states[w.word]?.lastLearnedAt || Date.now(),
    }))
    .sort((a, b) => b.at - a.at)
}

function normalizeWord(w: string) {
  return w.toLowerCase().replace(/[^a-z'-]/g, '')
}

/** 固定 4 个选项：1 个本词高频义 + 3 个干扰项 */
function buildOptions(
  current: Word,
  pool: Word[],
  correctLabel: string,
): OptionItem[] {
  const distractors: string[] = []
  const used = new Set<string>([correctLabel])

  for (const w of shuffle(pool)) {
    if (w.id === current.id) continue
    if (distractors.length >= 3) break
    const label = buildQuizDistractorLabel(w)
    if (!label || used.has(label)) continue
    used.add(label)
    distractors.push(label)
  }

  let tries = 0
  while (distractors.length < 3 && tries < 80) {
    tries++
    const w = shuffle(pool.filter((x) => x.id !== current.id))[0]
    if (!w) break
    const item = getCommonMeaningItems(w)[0]
    if (!item || used.has(item)) continue
    const label = w.pos ? `${w.pos} ${item}` : item
    if (used.has(label)) continue
    used.add(label)
    distractors.push(label)
  }

  const options: OptionItem[] = [
    { id: `${current.id}-correct`, meaning: correctLabel, isCorrect: true },
    ...distractors.slice(0, 3).map((meaning, i) => ({
      id: `${current.id}-d-${i}`,
      meaning,
      isCorrect: false,
    })),
  ]

  return shuffle(options)
}

/** 粗略判断是否为自然英语句子（过滤明显堆词/模板句） */
function isNaturalEnglishSentence(en: string): boolean {
  const s = en.trim()
  if (s.length < 24) return false
  if (!/[.!?]$/.test(s)) return false
  const tokens = s.split(/\s+/).filter(Boolean)
  if (tokens.length < 10) return false

  const badPatterns = [
    /appeared in contexts? that match/i,
    /in one natural sentence/i,
    /each common sense/i,
    /we practiced .+, .+, .+,/i,
    /we used .+, .+, .+,/i,
    /students reviewed .+, .+, .+,/i,
  ]
  if (badPatterns.some((re) => re.test(s))) return false

  const hasVerb =
    /\b(am|is|are|was|were|be|been|being|have|has|had|do|does|did|will|would|can|could|should|may|might|must|shall|go|goes|went|make|makes|made|take|takes|took|get|gets|got|see|saw|know|knew|think|thought|say|said|come|came|want|need|help|learn|study|work|live|feel|seem|become|find|give|tell|ask|use|try|leave|call|keep|let|begin|show|hear|play|run|move|live|believe|bring|happen|write|provide|sit|stand|lose|pay|meet|include|continue|set|learn|change|lead|understand|watch|follow|stop|create|speak|read|allow|add|spend|grow|open|walk|win|offer|remember|consider|appear|buy|wait|serve|die|send|expect|build|stay|fall|cut|reach|kill|remain|suggest|raise|pass|sell|require|report|decide|pull)\b/i.test(
      s,
    )
  if (!hasVerb) return false

  const commaCount = (s.match(/,/g) ?? []).length
  if (commaCount >= 6 && tokens.length < commaCount * 3) return false

  return true
}

/** 本地兜底：拆成 2～3 句通顺英文，避免堆词 */
function generateLocalSentence(
  words: Word[],
  picks: PickedSense[],
): { en: string; zh: string } {
  const clauses: string[] = []
  for (let i = 0; i < words.length; i += 4) {
    const chunk = words.slice(i, i + 4)
    const list = chunk.map((w) => w.word).join(', ')
    clauses.push(
      clauses.length === 0
        ? `During the vocabulary class, the teacher explained ${list} with clear examples.`
        : `We then used ${list} in short pair-work conversations.`,
    )
  }
  const en = clauses.join(' ')
  const zh = picks
    .map((p) => {
      const w = words.find((x) => x.id === p.wordId)!
      return `${w.word}（${formatSenseForPrompt(p.sense)}）`
    })
    .join('、')
  return { en, zh: `本组复习：${zh}。` }
}

/** 校验 AI 返回的 JSON */
function parseAiSentence(raw: string, words: Word[]): { en: string; zh: string } | null {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { en?: string; zh?: string }
    if (!parsed.en || !parsed.zh) return null
    if (!validateSentenceCoverage(parsed.en, words)) return null

    return { en: parsed.en, zh: parsed.zh }
  } catch {
    return null
  }
}

type SentenceGenResult = {
  en: string
  zh: string
  source: 'ai' | 'local'
  error?: string
  senseIndices: Record<string, number>
  aiModel?: string
}

const pendingAiRequests = new Map<string, Promise<SentenceGenResult>>()

/** AI 生成例句（含超时、防抖、兜底） */
async function generateAiSentence(
  words: Word[],
  apiKey: string,
  prevIndices?: Record<string, number>,
  rotate = false,
  dedupeNonce = '',
): Promise<SentenceGenResult> {
  const picks = pickSentenceSenses(words, prevIndices, rotate)
  const senseIndices = picksToSenseIndices(picks)
  const requestKey = `${words.map((w) => w.id).join('-')}-${rotate ? 'r' : 'n'}-${JSON.stringify(senseIndices)}${dedupeNonce ? `-${dedupeNonce}` : ''}`
  const existing = pendingAiRequests.get(requestKey)
  if (existing) return existing

  const task = (async (): Promise<SentenceGenResult> => {
    const userPrompt = buildSentenceUserPrompt(words, picks, rotate)

    if (!apiKey) {
      return {
        ...generateLocalSentence(words, picks),
        source: 'local',
        error: '未配置 API Key',
        senseIndices,
      }
    }

    if (!isApiProxyAvailable()) {
      return {
        ...generateLocalSentence(words, picks),
        source: 'local',
        error: apiProxyUnavailableMessage(),
        senseIndices,
      }
    }

    try {
      const { content, model } = await chatWithModelFallback(
        apiKey,
        {
          temperature: rotate ? 0.75 : 0.65,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        },
        undefined,
        (raw) => {
          const parsed = parseAiSentence(raw, words)
          return parsed !== null && isNaturalEnglishSentence(parsed.en)
        },
      )

      const parsed = parseAiSentence(content, words)
      if (parsed) {
        return { ...parsed, source: 'ai', senseIndices, aiModel: model }
      }
      throw new Error('AI 返回格式无效')
    } catch (err) {
      const local = generateLocalSentence(words, picks)
      return {
        ...local,
        source: 'local',
        error: err instanceof Error ? err.message : '请求失败',
        senseIndices,
      }
    } finally {
      pendingAiRequests.delete(requestKey)
    }
  })()

  pendingAiRequests.set(requestKey, task)
  return task
}

function SpeakIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03z" />
    </svg>
  )
}

function isCacheValid(
  cache: CachedSentence | undefined,
  wordIds: string[],
  words: Word[],
): boolean {
  if (!cache) return false
  if (cache.wordIds.join(',') !== wordIds.join(',')) return false
  if (cache.source === 'local') {
    if (cache.promptV !== SENTENCE_PROMPT_V) return false
    if (Date.now() - cache.createdAt > LOCAL_FALLBACK_TTL) return false
    return true
  }
  if (cache.source === 'ai' || cache.source === 'exam') {
    if (Date.now() - cache.createdAt > CACHE_TTL) return false
    if (!sentenceCoversAllWords(cache.en, words)) return false
  }
  return true
}

/* ===================== 子组件 ===================== */

function AppSettings({
  apiKey,
  onSave,
  aiStatus,
}: {
  apiKey: string
  onSave: (key: string) => void
  aiStatus: 'connected' | 'local' | 'unknown'
}) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState(apiKey)
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState('')
  const [backupMsg, setBackupMsg] = useState('')
  const [accent, setAccent] = useState<AccentPref>(() => getAccentPref())
  const [syncCodeInput, setSyncCodeInput] = useState(() => getSyncCode())
  const [syncEnabled, setSyncEnabled] = useState(() => isSyncEnabled())
  const [cloudMsg, setCloudMsg] = useState('')
  const [cloudBusy, setCloudBusy] = useState(false)
  const [lastSyncLabel, setLastSyncLabel] = useState(() => getLastSyncLabel())
  const importRef = useRef<HTMLInputElement>(null)
  const cloudConfigured = isCloudSyncConfigured()

  useEffect(() => {
    setSyncCodeInput(getSyncCode())
    setSyncEnabled(isSyncEnabled())
    setLastSyncLabel(getLastSyncLabel())
  }, [open])

  useEffect(() => {
    setInput(apiKey)
  }, [apiKey])

  const handleEnableCloudSync = async () => {
    setCloudBusy(true)
    setCloudMsg('')
    const res = await enableCloudSync(syncCodeInput)
    setCloudBusy(false)
    if (res.ok) {
      setSyncEnabled(true)
      setLastSyncLabel(getLastSyncLabel())
      setCloudMsg(res.message)
      if (res.appliedRemote) {
        setTimeout(() => window.location.reload(), 800)
      }
    } else {
      setCloudMsg(res.error)
    }
  }

  const handleCloudSyncNow = async () => {
    setCloudBusy(true)
    setCloudMsg('')
    const res = await runCloudSync(true)
    setCloudBusy(false)
    if (res.ok) {
      setLastSyncLabel(getLastSyncLabel())
      setCloudMsg(res.message)
      if (res.appliedRemote) {
        setTimeout(() => window.location.reload(), 800)
      }
    } else {
      setCloudMsg(res.error)
    }
  }

  const handleTest = async () => {
    const key = input.trim()
    if (!key) {
      setTestMsg('请先输入 API Key')
      return
    }
    if (!isApiProxyAvailable()) {
      setTestMsg(apiProxyUnavailableMessage())
      return
    }
    setTesting(true)
    setTestMsg('')
    try {
      const { model, triedModels } = await chatWithModelFallback(key, {
        max_tokens: 30,
        messages: [{ role: 'user', content: 'Say OK' }],
      })
      setTestMsg(
        triedModels.length > 1
          ? `连接成功 ✓（模型 ${model}，已跳过 ${triedModels.length - 1} 个不可用模型）`
          : `连接成功 ✓（模型 ${model}）`,
      )
    } catch (err) {
      setTestMsg(
        err instanceof Error
          ? err.message
          : isNativeApp()
            ? '网络错误，请确认手机已联网且 API Key 有效'
            : '网络错误，请确认已部署 /api 代理或运行 npm run dev',
      )
    } finally {
      setTesting(false)
    }
  }

  const statusColor =
    aiStatus === 'connected'
      ? 'bg-emerald-400'
      : aiStatus === 'local'
        ? 'bg-orange-400'
        : 'bg-slate-300'

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="app-icon-btn relative flex items-center gap-1 px-2.5"
        title="设置"
        aria-label="设置"
      >
        <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${statusColor}`} />
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7v1h1a2 2 0 1 1 0 4h-1v1a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7v-1H4a2 2 0 1 1 0-4h1v-1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
        </svg>
        <span className="text-xs font-medium text-slate-600">设置</span>
      </button>

      {open && (
        <div className="app-sheet" onClick={() => setOpen(false)}>
          <div className="app-sheet-panel" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-800">设置</h3>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-400">
              云同步（推荐）
            </p>
            {!cloudConfigured ? (
              <p className="mt-1 text-sm text-orange-600">
                尚未配置云服务。在电脑 .env.local 填入 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重新 build（见 scripts/supabase-schema.sql）。
              </p>
            ) : (
              <>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  手机和平板填<strong>相同同步码</strong>，需<strong>联网</strong>（断网只能本地学，不能云同步）。
                  上次同步：{lastSyncLabel}
                </p>
                <input
                  type="password"
                  value={syncCodeInput}
                  onChange={(e) => setSyncCodeInput(e.target.value)}
                  placeholder="自定义同步码（至少 4 位）"
                  className="mt-3 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {!syncEnabled ? (
                    <button
                      type="button"
                      disabled={cloudBusy}
                      onClick={() => void handleEnableCloudSync()}
                      className="rounded-xl bg-indigo-500 px-4 py-2 text-sm text-white card-press hover:bg-indigo-600 disabled:opacity-60"
                    >
                      {cloudBusy ? '同步中…' : '开启云同步'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={cloudBusy}
                        onClick={() => void handleCloudSyncNow()}
                        className="rounded-xl bg-indigo-500 px-4 py-2 text-sm text-white card-press hover:bg-indigo-600 disabled:opacity-60"
                      >
                        {cloudBusy ? '同步中…' : '立即同步'}
                      </button>
                      <button
                        type="button"
                        disabled={cloudBusy}
                        onClick={() => {
                          disableCloudSync()
                          setSyncEnabled(false)
                          setCloudMsg('已关闭云同步')
                        }}
                        className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700 card-press hover:bg-slate-200"
                      >
                        关闭
                      </button>
                    </>
                  )}
                </div>
                {syncEnabled && (
                  <p className="mt-2 text-[11px] text-emerald-600">云同步已开启 · 学习后会自动上传</p>
                )}
                {syncEnabled && getLastSyncError() && (
                  <p className="mt-1 text-[11px] text-orange-600">上次失败：{getLastSyncError()}</p>
                )}
              </>
            )}
            {cloudMsg && (
              <p
                className={`mt-2 text-xs ${cloudMsg.includes('失败') || cloudMsg.includes('未') || cloudMsg.includes('至少') ? 'text-orange-600' : 'text-emerald-600'}`}
              >
                {cloudMsg}
              </p>
            )}

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              手动备份
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              无云同步时，可导出 JSON 文件在微信 / 网盘传到另一台设备导入。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  exportBackupFile()
                  setBackupMsg(`已导出 ${countBackupKeys()} 项数据`)
                }}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm text-white card-press hover:bg-emerald-600"
              >
                导出备份
              </button>
              <button
                type="button"
                onClick={() => importRef.current?.click()}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700 card-press hover:bg-slate-200"
              >
                导入备份
              </button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  void importBackupFromFile(file).then((res) => {
                    if (res.ok) {
                      setBackupMsg(`已恢复 ${res.count} 项，即将刷新…`)
                      setTimeout(() => window.location.reload(), 800)
                    } else {
                      setBackupMsg(res.error)
                    }
                  })
                }}
              />
            </div>
            {backupMsg && (
              <p
                className={`mt-2 text-xs ${backupMsg.includes('失败') || backupMsg.includes('无效') || backupMsg.includes('缺失') ? 'text-orange-600' : 'text-emerald-600'}`}
              >
                {backupMsg}
              </p>
            )}

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              发音
            </p>
            <p className="mt-1 text-sm text-slate-500">
              单词：有道词典发音。句子（阅读/作文/例句）：百度翻译标准朗读，更清晰自然。可切换美音 / 英音。
            </p>
            <div className="mt-2 flex gap-2">
              {(
                [
                  ['us', '美音'],
                  ['uk', '英音'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAccentPref(key)
                    setAccent(key)
                  }}
                  className={`flex-1 rounded-xl py-2 text-sm font-medium card-press ${
                    accent === key
                      ? 'bg-indigo-500 text-white'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              AI 例句
            </p>
            <p className="mt-1 text-sm text-slate-500">
              当前对接 {AI_PROVIDER}。
              {isNativeApp() ? (
                <>
                  APK 安装包会<strong>直连百炼</strong>（手机联网即可），Key 可在打包时写入
                  <code className="mx-1 text-xs">.env.local</code>，也可在下方修改。
                  {getBuiltinApiKey() ? (
                    <span className="mt-1 block text-emerald-600">已检测到内置 API Key</span>
                  ) : (
                    <span className="mt-1 block text-orange-600">
                      未内置 Key，请填写后保存，或重新打包 APK
                    </span>
                  )}
                </>
              ) : (
                <>
                  请求经服务端 <code className="text-xs">/api</code> 代理转发。已内置{' '}
                  {BAILIAN_CHAT_MODELS.length} 个模型自动轮换，当前优先{' '}
                  <strong>{getLastWorkingModel()}</strong>。
                </>
              )}
            </p>
            <input
              type="password"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="sk-百炼API密钥"
              className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
            />
            {testMsg && (
              <p className={`mt-2 text-xs ${testMsg.includes('成功') ? 'text-emerald-600' : 'text-orange-600'}`}>
                {testMsg}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={testing}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm text-slate-700 card-press hover:bg-slate-200 disabled:opacity-60"
              >
                {testing ? '测试中…' : '测试连接'}
              </button>
              <button
                type="button"
                onClick={() => {
                  onSave(input.trim())
                  setOpen(false)
                }}
                className="flex-1 rounded-xl bg-indigo-500 py-2 text-sm text-white card-press hover:bg-indigo-600"
              >
                保存并启用
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              {isNativeApp()
                ? '打包命令：npm run cap:apk（Key 写在 .env.local 的 VITE_OPENAI_API_KEY）'
                : '网页部署默认同源 /api 代理；开发环境用 npm run dev'}
            </p>

            <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">
              安装到手机 / 平板
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              用 Chrome 打开本页 → 右上角 <strong>⋮</strong> →「添加到主屏幕」或「安装应用」。
              安装后像普通 App 一样从桌面打开，可离线背单词（AI 例句需联网）。
            </p>
          </div>
        </div>
      )}
    </>
  )
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: string
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="app-progress-track">
      <div className="app-progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

function TabIcon({ tab, active }: { tab: TabKey; active: boolean }) {
  const stroke = active ? 2.2 : 1.8
  const opacity = active ? 1 : 0.55
  if (tab === 'learn') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path
          d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (tab === 'review') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path
          d="M1 4v6h6M23 20v-6h-6"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.49 9A9 9 0 0 0 5.64 5.64L1 4M23 20l-4.64-1.36A9 9 0 0 1 3.51 15"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (tab === 'words') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path
          d="M4 6h16M4 12h10M4 18h14"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <circle cx="19" cy="17" r="3" stroke="currentColor" strokeWidth={stroke} />
        <path d="M21 19l1.5 1.5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    )
  }
  if (tab === 'articles') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path
          d="M12 6.5V19M6 8h12M6 12h8"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <path
          d="M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (tab === 'essays') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path
          d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinejoin="round"
        />
        <path d="M14 2v6h6M8 13h8M8 17h5" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    )
  }
  if (tab === 'stats') {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
        <path d="M4 20V10M10 20V4M16 20v-6M22 20V8" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={stroke} />
      <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" />
    </svg>
  )
}

function MoreIcon({ active }: { active: boolean }) {
  const opacity = active ? 1 : 0.55
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ opacity }}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

function MeaningReveal({
  word,
  dictMap,
}: {
  word: Word
  dictMap: Map<string, { m: string; p?: string; o?: string }> | null
}) {
  const fullMeaning = useMemo(
    () => getRicherMeaning(word.word, word.meaning, dictMap),
    [word.word, word.meaning, dictMap],
  )
  const enriched = useMemo(
  () =>
    dictMap
      ? {
          ...word,
          meaning: fullMeaning,
          phonetic: word.phonetic || lookupWord(word.word, dictMap)?.phonetic,
        }
      : word,
    [word, fullMeaning, dictMap],
  )
  const groups = parseMeaningGroups(fullMeaning)
  const allItems = groups.flatMap((g) => g.items)
  const extraCount = allItems.filter((i) => isObscureMeaning(i)).length
  const dictEnriched = fullMeaning.length > word.meaning.trim().length + 8

  return (
    <div className="meaning-reveal mt-5 rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50 via-white to-green-50 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-xs text-white">
            ✓
          </span>
          <p className="text-sm font-medium text-emerald-700">完整释义</p>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-600">
            共 {allItems.length} 项
          </span>
          {dictEnriched && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-600">
              词典补全
            </span>
          )}
          {extraCount > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              含 {extraCount} 项拓展义
            </span>
          )}
        </div>
        {(enriched.phonetic || word.phonetic) && (
          <span className="text-sm text-slate-400">{enriched.phonetic || word.phonetic}</span>
        )}
      </div>
      <div className="meaning-scroll max-h-[min(52vh,420px)] space-y-3 overflow-y-auto pr-1">
        {groups.map((group, gi) => (
          <div
            key={`${word.id}-g-${gi}`}
            className="rounded-xl bg-white/80 p-4 ring-1 ring-emerald-100/80"
          >
            {group.pos ? (
              <span className="meaning-pos-tag inline-block rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                {group.pos}
              </span>
            ) : null}
            <p className="mt-2 text-[15px] leading-relaxed text-stone-700">
              {group.items.map((item, ii) => {
                const obscure = isObscureMeaning(item)
                const isCommon = isCommonMeaningItem(enriched, item)
                const text = cleanMeaningItem(item) || item
                return (
                  <span key={`${word.id}-${gi}-${ii}`}>
                    {ii > 0 && <span className="text-stone-300">；</span>}
                    <span
                      className={
                        isCommon
                          ? 'font-semibold text-emerald-700'
                          : obscure
                            ? 'text-stone-400'
                            : 'text-stone-700'
                      }
                    >
                      {text}
                    </span>
                  </span>
                )
              })}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl bg-white/80 p-5 shadow-card">
      <div className="skeleton skeleton-line w-full" />
      <div className="skeleton skeleton-line w-11/12" />
      <div className="skeleton skeleton-line" />
    </div>
  )
}

function SentencePanel({
  groups,
  cachePrefix,
  displayMode,
  onDisplayModeChange,
  sentenceCache,
  setSentenceCache,
  theme,
  emptyText,
  apiKey,
  sentenceCacheKey,
  active = true,
}: {
  groups: SentenceGroup[]
  cachePrefix: string
  displayMode: DisplayMode
  onDisplayModeChange: (m: DisplayMode) => void
  sentenceCache: Record<string, CachedSentence>
  setSentenceCache: React.Dispatch<React.SetStateAction<Record<string, CachedSentence>>>
  sentenceCacheKey: string
  theme: 'review' | 'wrong'
  emptyText: string
  apiKey: string
  active?: boolean
}) {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set())
  const [refreshingAll, setRefreshingAll] = useState(false)
  const [fadeState, setFadeState] = useState<'idle' | 'out' | 'in'>('idle')
  const [modeFading, setModeFading] = useState(false)
  const [popupWord, setPopupWord] = useState<{
    display: string
    entry: DictEntry | null
    loading?: boolean
    error?: string
  } | null>(null)
  const [errorKeys, setErrorKeys] = useState<Record<string, string>>({})
  const sentenceCacheRef = useRef(sentenceCache)
  sentenceCacheRef.current = sentenceCache

  const [dictMap, setDictMap] = useState<Map<string, { m: string; p?: string; o?: string }> | null>(
    null,
  )

  useEffect(() => {
    void loadDictionary().then(setDictMap)
  }, [])

  const targetWordKeys = useMemo(() => {
    const set = new Set<string>()
    groups.forEach((g) => g.words.forEach((w) => set.add(normalizeWord(w.word))))
    return set
  }, [groups])

  const dictLookup = useCallback(
    (word: string): DictEntry | null => {
      if (dictMap) {
        const local = lookupWord(word, dictMap)
        if (local) return local
      }
      return getOnlineDictEntry(word)
    },
    [dictMap],
  )

  const tapSeqRef = useRef(0)

  const handleWordTap = useCallback(
    async ({ display, entry }: WordTapInfo) => {
      const seq = ++tapSeqRef.current
      if (entry) {
        setPopupWord({ display, entry, loading: false })
        return
      }
      setPopupWord({ display, entry: null, loading: true })
      try {
        const online = await lookupWordOnline(display, apiKey || undefined)
        if (seq !== tapSeqRef.current) return
        setPopupWord({
          display,
          entry: online,
          loading: false,
          error: online ? undefined : '未找到释义',
        })
      } catch {
        if (seq !== tapSeqRef.current) return
        setPopupWord({
          display,
          entry: null,
          loading: false,
          error: '联网查词失败',
        })
      }
    },
    [apiKey],
  )

  const persistEntry = useCallback(
    (cacheKey: string, entry: CachedSentence) => {
      setSentenceCache((prev) => {
        const next = { ...prev, [cacheKey]: entry }
        saveJson(sentenceCacheKey, next)
        return next
      })
    },
    [setSentenceCache, sentenceCacheKey],
  )

  const writeLocalEntry = useCallback(
    (
      cacheKey: string,
      group: SentenceGroup,
      wordIds: string[],
      picks: PickedSense[],
      genError?: string,
    ) => {
      const local = generateLocalSentence(group.words, picks)
      persistEntry(cacheKey, {
        en: local.en,
        zh: local.zh,
        wordIds,
        createdAt: Date.now(),
        source: 'local',
        promptV: SENTENCE_PROMPT_V,
        senseIndices: picksToSenseIndices(picks),
        genError,
      })
    },
    [persistEntry],
  )

  const generateOne = useCallback(
    async (group: SentenceGroup, force = false) => {
      const wordIds = group.words.map((w) => w.id)
      const cacheKey = `${cachePrefix}-${group.key}`
      const cached = sentenceCacheRef.current[cacheKey]

      if (!force && isCacheValid(cached, wordIds, group.words)) {
        return
      }

      const picks = pickSentenceSenses(group.words, cached?.senseIndices, force)

      setLoadingKeys((prev) => new Set(prev).add(cacheKey))
      setErrorKeys((prev) => {
        if (!prev[cacheKey]) return prev
        const next = { ...prev }
        delete next[cacheKey]
        return next
      })

      try {
        const exam = await fetchExamSentenceForGroup(group.words)
        if (exam) {
          persistEntry(cacheKey, {
            en: exam.en,
            zh: exam.zh,
            wordIds,
            createdAt: Date.now(),
            source: 'exam',
            examSource: exam.source,
          })
          return
        }

        if (!apiKey) {
          writeLocalEntry(cacheKey, group, wordIds, picks, '未配置 API Key')
          return
        }

        if (!isApiProxyAvailable()) {
          writeLocalEntry(cacheKey, group, wordIds, picks, apiProxyUnavailableMessage())
          return
        }

        const result = await generateAiSentence(
          group.words,
          apiKey,
          cached?.senseIndices,
          force,
          force ? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` : '',
        )
        persistEntry(cacheKey, {
          en: result.en,
          zh: result.zh,
          wordIds,
          createdAt: Date.now(),
          source: result.source,
          promptV: SENTENCE_PROMPT_V,
          senseIndices: result.senseIndices,
          aiModel: result.aiModel,
          genError: result.source === 'local' ? result.error : undefined,
        })
        if (result.source === 'local' && result.error) {
          setErrorKeys((prev) => ({ ...prev, [cacheKey]: result.error! }))
        }
      } catch (err) {
        console.error('[cet4] 例句生成失败', cacheKey, err)
        const msg = err instanceof Error ? err.message : '生成失败，已使用本地例句'
        writeLocalEntry(cacheKey, group, wordIds, picks, msg)
        setErrorKeys((prev) => ({
          ...prev,
          [cacheKey]: msg,
        }))
      } finally {
        setLoadingKeys((prev) => {
          const next = new Set(prev)
          next.delete(cacheKey)
          return next
        })
      }
    },
    [apiKey, cachePrefix, persistEntry, writeLocalEntry],
  )

  // 切回 Tab 时重置淡出状态（错词页常驻时刷新可能卡在透明）
  useEffect(() => {
    if (active) setFadeState('idle')
  }, [active])

  // 初次加载 / 切回当前 Tab：限制并发，避免同时打满 API
  useEffect(() => {
    if (!active || !groups.length) return
    void asyncPool(groups, AI_SENTENCE_CONCURRENCY, async (g) => {
      try {
        await generateOne(g)
      } catch (e) {
        console.error('[cet4] 例句加载失败', g.key, e)
      }
    })
  }, [active, groups, generateOne])

  const handleRefreshAll = async () => {
    if (refreshingAll || !groups.length) return
    setRefreshingAll(true)
    setFadeState('out')
    try {
      await new Promise((r) => setTimeout(r, 250))
      await asyncPool(groups, AI_SENTENCE_CONCURRENCY, async (g) => {
        try {
          await generateOne(g, true)
        } catch (e) {
          console.error('[cet4] 刷新例句失败', g.key, e)
        }
      })
      setFadeState('in')
      setTimeout(() => setFadeState('idle'), 350)
    } catch (e) {
      console.error('[cet4] 批量刷新失败', e)
      setFadeState('idle')
    } finally {
      setRefreshingAll(false)
    }
  }

  const handleRefreshOne = (group: SentenceGroup) => {
    void generateOne(group, true)
  }

  const handleModeChange = (mode: DisplayMode) => {
    if (mode === displayMode) return
    setModeFading(true)
    setTimeout(() => {
      onDisplayModeChange(mode)
      setModeFading(false)
    }, 150)
  }

  const isOrange = theme === 'wrong'
  const accentClass = isOrange ? 'text-orange-500' : 'text-emerald-600'
  const btnClass = isOrange
    ? 'bg-orange-500 hover:bg-orange-600'
    : 'bg-emerald-500 hover:bg-emerald-600'
  const highlightExtra = isOrange ? 'word-highlight-orange' : ''

  if (!groups.length) {
    return (
      <div className="app-card flex min-h-[40vh] flex-col items-center justify-center p-8 text-center">
        <div className="mb-3 text-4xl opacity-40">{isOrange ? '✓' : '📖'}</div>
        <p className="text-sm text-slate-500">{emptyText}</p>
      </div>
    )
  }

  const fadeClass =
    fadeState === 'out'
      ? 'sentences-fade-out'
      : fadeState === 'in'
        ? 'sentences-fade-in'
        : ''

  return (
    <div className="space-y-3">
      <div className="app-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(['en', 'zh', 'both'] as DisplayMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium card-press ${
                  displayMode === m
                    ? `${btnClass} text-white shadow-sm`
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {m === 'en' ? '英文' : m === 'zh' ? '中文' : '对照'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            disabled={refreshingAll}
            className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-white card-press ${btnClass} disabled:opacity-60`}
          >
            <svg
              className={`h-3.5 w-3.5 ${refreshingAll ? 'spin' : ''}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M4 4v5h5M20 20v-5h-5" />
              <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 4M19 19l-1.64 1.36A9 9 0 0 1 3.51 15" />
            </svg>
            刷新
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          点击英文查释义；超纲词自动联网查询并缓存到本地
        </p>
      </div>

      <div className={`space-y-3 ${fadeClass}`}>
        {groups.map((group, idx) => {
          const cacheKey = `${cachePrefix}-${group.key}`
          const cached = sentenceCache[cacheKey]
          const upgrading = loadingKeys.has(cacheKey)
          const loading = !cached

          return (
            <div
              key={group.key}
              className={`app-card p-4 ${isOrange ? 'wrong-pulse' : ''} sentence-enter`}
              style={{ animationDelay: `${idx * 0.1}s` }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {group.words.map((w) => (
                    <span
                      key={w.id}
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        cached?.en && wordAppearsInSentence(cached.en, w.word)
                          ? isOrange
                            ? 'bg-orange-100 text-orange-800'
                            : 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {!loading && cached?.en && (
                    <button
                      type="button"
                      aria-label="朗读例句"
                      onClick={() => speakSentence(cached.en)}
                      className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 card-press ${accentClass}`}
                    >
                      <SpeakIcon />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="刷新此句"
                    onClick={() => handleRefreshOne(group)}
                    className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 card-press ${accentClass}`}
                  >
                    <svg
                      className={`h-4 w-4 ${upgrading ? 'spin' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M4 4v5h5M20 20v-5h-5" />
                      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 4M19 19l-1.64 1.36A9 9 0 0 1 3.51 15" />
                    </svg>
                  </button>
                </div>
              </div>

              {loading ? (
                <SkeletonCard />
              ) : (
                <>
                <div className={`mode-text ${modeFading ? 'mode-text-fade' : ''}`}>
                  {(displayMode === 'en' || displayMode === 'both') && (
                    <p className="sentence-en text-base leading-relaxed text-slate-800">
                      <ClickableSentence
                        text={cached.en}
                        targetWords={targetWordKeys}
                        lookup={dictLookup}
                        onWordTap={(info) => void handleWordTap(info)}
                        targetHighlightClass={highlightExtra}
                      />
                    </p>
                  )}
                  {(displayMode === 'zh' || displayMode === 'both') && (
                    <p
                      className={`sentence-zh text-sm leading-relaxed text-slate-500 ${
                        displayMode === 'both' ? 'mt-2' : ''
                      }`}
                    >
                      {cached.zh}
                    </p>
                  )}
                  {cached.source === 'ai' && cached.aiModel && (
                    <p className="mt-2 text-xs text-slate-400">模型：{cached.aiModel}</p>
                  )}
                  {cached.source === 'local' && (
                    <p className="mt-2 text-xs text-orange-500">
                      {apiKey
                        ? `临时兜底（待重试）${
                            cached.genError || errorKeys[cacheKey]
                              ? `：${cached.genError || errorKeys[cacheKey]}`
                              : ''
                          } · 可点刷新重试`
                        : '请配置 AI Key 后刷新'}
                    </p>
                  )}
                  {cached.source === 'exam' && (
                    <p className="mt-2 text-xs text-indigo-500">
                      真题语境{cached.examSource ? ` · ${cached.examSource}` : ''}
                    </p>
                  )}
                  {cached.source === 'ai' && (
                    <p className="mt-2 text-xs text-emerald-500">AI 生成</p>
                  )}
                </div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {popupWord && (
        <DictionaryPopup
          displayWord={popupWord.display}
          entry={popupWord.entry}
          loading={popupWord.loading}
          error={popupWord.error}
          onClose={() => setPopupWord(null)}
        />
      )}
    </div>
  )
}

function LearnTab({
  queue,
  allWords,
  learnIndex,
  onNext,
  onCorrect,
  onWrong,
  onClearWrong,
  onMarkMastered,
  progress,
  libraryTheme,
  learningComplete,
  onResetProgress,
  onBatchMarkMastered,
  dailyTaskInfo,
}: {
  queue: Word[]
  allWords: Word[]
  learnIndex: number
  onNext: () => void
  onCorrect: (word: Word) => void
  onWrong: (word: Word) => void
  onClearWrong: (id: string) => void
  onMarkMastered: (word: Word) => void
  progress: LearningProgress
  libraryTheme: 'blue' | 'green'
  learningComplete: boolean
  onResetProgress: () => void
  onBatchMarkMastered: (count: number) => void
  dailyTaskInfo?: { todayWords: number; dailyTarget: number; completedDays: number }
}) {
  const [options, setOptions] = useState<OptionItem[]>([])
  const [answered, setAnswered] = useState(false)
  const [clickedWrong, setClickedWrong] = useState<Set<string>>(new Set())
  const [shakingId, setShakingId] = useState<string | null>(null)
  const [showCheck, setShowCheck] = useState(false)
  const [soundRipple, setSoundRipple] = useState(false)
  const [slideKey, setSlideKey] = useState(0)
  const [wrongedThisRound, setWrongedThisRound] = useState(false)
  /** 答对后固定当前词，避免掌握后立即出队导致绿屏/释义被下一题顶掉 */
  const [pinnedWord, setPinnedWord] = useState<Word | null>(null)
  const [streak, setStreak] = useState(readStreak)
  const [dictMap, setDictMap] = useState<Map<
    string,
    { m: string; p?: string; o?: string }
  > | null>(null)

  const safeIndex = queue.length ? Math.min(learnIndex, queue.length - 1) : 0
  const queueWord = queue[safeIndex]
  const current = pinnedWord ?? queueWord

  const revealWord = useMemo(() => {
    if (!current || !dictMap) return current
    const meaning = getRicherMeaning(current.word, current.meaning, dictMap)
    const phonetic = current.phonetic || lookupWord(current.word, dictMap)?.phonetic
    if (meaning === current.meaning && phonetic === current.phonetic) return current
    return { ...current, meaning, phonetic }
  }, [current, dictMap])

  const roundTotal = Math.max(1, progress.remainingWords)
  const roundDone = Math.min(progress.roundProgress, roundTotal)
  const totalPct =
    progress.totalWords > 0
      ? Math.round((progress.masteredWords / progress.totalWords) * 100)
      : 0

  useEffect(() => {
    void loadDictionary().then(setDictMap)
  }, [])

  useEffect(() => {
    setPinnedWord(null)
  }, [learnIndex])

  useEffect(() => {
    setStreak(readStreak())
  }, [learnIndex, answered])

  useEffect(() => {
    if (!current) return
    const target = buildQuizCorrectLabel(current)
    setOptions(buildOptions(current, allWords, target))
    setAnswered(false)
    setClickedWrong(new Set())
    setShakingId(null)
    setShowCheck(false)
    setWrongedThisRound(false)
  }, [current?.id, allWords])

  useEffect(() => {
    if (!current?.word) return
    autoSpeakWord(current.word)
  }, [current?.word])

  if (learningComplete) {
    return (
      <div className="study-celebrate app-card flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
        <div className="study-celebrate-icon mb-4">🎉</div>
        <h2 className="text-xl font-bold text-emerald-800">太棒了，全部掌握！</h2>
        <p className="mt-2 text-sm text-stone-600">
          你已经掌握了所有 {progress.totalWords} 个单词
        </p>
        <p className="mt-1 text-xs text-stone-400">坚持背单词，四级一定过 💪</p>
        <button type="button" onClick={onResetProgress} className="app-primary-btn mt-6">
          重新开始学习
        </button>
      </div>
    )
  }

  if (!queue.length && !pinnedWord) {
    return (
      <div className="app-card flex min-h-[40vh] flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-slate-600">本轮学习队列已空</p>
        <p className="mt-2 text-xs text-slate-400">
          已掌握 {progress.masteredWords}/{progress.totalWords}，可切换到复习/错词页巩固
        </p>
        <button type="button" onClick={onResetProgress} className="mt-4 text-sm text-indigo-600">
          重置学习进度
        </button>
      </div>
    )
  }

  if (!current) {
    return (
      <div className="app-card flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-slate-500">加载中…</p>
      </div>
    )
  }

  const handleSelect = (opt: OptionItem) => {
    if (answered || clickedWrong.has(opt.id)) return
    cancelAutoSpeak()

    if (opt.isCorrect) {
      setPinnedWord(current)
      setAnswered(true)
      setShowCheck(true)
      onCorrect(current)
      setStreak(readStreak())
      if (!wrongedThisRound) onClearWrong(current.id)
      setTimeout(() => setShowCheck(false), 700)
    } else {
      setShakingId(opt.id)
      setClickedWrong((prev) => new Set(prev).add(opt.id))
      setWrongedThisRound(true)
      onWrong(current)
      setTimeout(() => setShakingId(null), 450)
    }
  }

  const handleSpeak = () => {
    markSpeechUnlocked()
    speakWord(current.word)
    setSoundRipple(true)
    setTimeout(() => setSoundRipple(false), 600)
  }

  const wrongOptionCount = options.filter((o) => !o.isCorrect).length
  const allWrongTried = wrongOptionCount > 0 && clickedWrong.size >= wrongOptionCount

  return (
    <div className="study-learn-wrap relative space-y-3 pb-2">
      <div className="study-dashboard app-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="study-dashboard-title">
            <span>📊</span> 今日背单词
          </p>
          <StreakFlame streak={streak} />
        </div>
        <div className="mb-3 mt-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-stone-800">
            第 {progress.currentRound} 轮 / 共 {progress.totalRounds} 轮
          </p>
          <span className={`app-chip ${libraryTheme === 'green' ? 'app-chip--green' : ''}`}>
            目标 {Math.min(progress.remainingWords, libraryTheme === 'green' ? 200 : 150)} 词
          </span>
        </div>
        <p className="mb-2 text-xs text-slate-500">
          已掌握 {progress.masteredWords}/{progress.totalWords}（{totalPct}%）
        </p>
        <ProgressBar value={progress.masteredWords} max={progress.totalWords || 1} color="#6366f1" />
        <p className="mb-2 mt-3 text-xs text-slate-500">
          本轮进度 {roundDone}/{roundTotal} · 剩余 {progress.remainingWords} 词
        </p>
        <ProgressBar value={roundDone} max={roundTotal} color="#10b981" />
        {libraryTheme === 'green' && dailyTaskInfo && (
          <p className="mt-2 text-[11px] text-slate-400">
            今日新掌握 {dailyTaskInfo.todayWords}/{dailyTaskInfo.dailyTarget} · 累计完成{' '}
            {dailyTaskInfo.completedDays} 天
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onBatchMarkMastered(50)}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 card-press"
          >
            标记前50个已会
          </button>
          <button
            type="button"
            onClick={onResetProgress}
            className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] text-slate-600 card-press"
          >
            重置进度
          </button>
        </div>
      </div>

      <div key={slideKey} className="word-slide-in study-flashcard">
        <p className="study-quiz-prompt">选出四级常考释义</p>
        <div className="study-word-hero">
          <button
            type="button"
            aria-label="发音"
            onClick={handleSpeak}
            className="app-speak-btn absolute right-0 top-0 card-press"
          >
            {soundRipple && <span className="sound-ripple" />}
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03z" />
            </svg>
          </button>
          <p className="study-word">{current.word}</p>
          {current.phonetic && (
            <p className="mt-1 text-sm text-stone-400">{current.phonetic}</p>
          )}
          {typeof current.examFreq === 'number' && current.examFreq > 0 && (
            <p className="mt-1 text-xs font-medium text-amber-700">
              四级考频 {current.examFreq}
              {current.freqRank ? ` · 高频第 ${current.freqRank}` : ''}
            </p>
          )}
          <p className="study-word-hint">先在心里默念一遍，再选释义</p>
        </div>

        <div className="grid gap-3">
          {options.map((opt, i) => {
            const isShaking = shakingId === opt.id
            const isWrongClicked = clickedWrong.has(opt.id)
            const isCorrectSelected = answered && opt.isCorrect
            const showBreathe = opt.isCorrect && !answered && allWrongTried
            const letters = ['A', 'B', 'C', 'D']

            return (
              <button
                key={opt.id}
                type="button"
                disabled={answered || isWrongClicked}
                onClick={() => handleSelect(opt)}
                className={[
                  'option-btn study-option relative card-press opacity-100 option-enter',
                  isShaking ? 'shake' : '',
                  isWrongClicked ? 'option-wrong' : '',
                  isCorrectSelected ? 'correct-pop option-correct' : '',
                  showBreathe ? 'breathe-hint' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ animationDelay: `${Math.min(i * 0.08, 0.48)}s` }}
              >
                <span className="study-option-letter">{letters[i] ?? '·'}</span>
                <span className="study-option-text">{opt.meaning}</span>
                {isCorrectSelected && showCheck && (
                  <span className="check-float absolute right-4 top-1/2 -translate-y-1/2 text-2xl text-emerald-800">
                    ✓
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {answered && revealWord && (
          <MeaningReveal word={revealWord} dictMap={dictMap} />
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onMarkMastered(current)}
            className="flex-1 rounded-2xl border-2 border-indigo-200 bg-white py-3.5 text-sm font-medium text-indigo-600 card-press hover:bg-indigo-50"
          >
            我已经掌握了
          </button>
          {answered && (
            <button
              type="button"
              onClick={() => {
                setSlideKey((k) => k + 1)
                onNext()
              }}
              className="app-primary-btn flex-1"
            >
              下一题
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ===================== 主应用 ===================== */
export default function App() {
  const [tab, setTab] = useState<TabKey>('learn')
  const [moreOpen, setMoreOpen] = useState(false)
  const [currentLibrary, setCurrentLibrary] = useState<WordLibrary>(() => readLibraryChoice())
  const [isLibraryLoading, setIsLibraryLoading] = useState(false)
  const [words, setWords] = useState<Word[]>([])
  const [wordsReady, setWordsReady] = useState(false)
  const [, setMasteredRecords] = useState<Array<{ id: string; at: number }>>([])
  const [wrongMap, setWrongMap] = useState<Record<string, number>>({})
  const [displayMode, setDisplayMode] = useState<DisplayMode>('both')
  const [sentenceCache, setSentenceCache] = useState<Record<string, CachedSentence>>({})
  const [learnIndex, setLearnIndex] = useState(0)
  const [dailyTask, setDailyTask] = useState<DailyTask>(DEFAULT_DAILY_TASK)
  const [wordStates, setWordStates] = useState<Record<string, WordLearningState>>({})
  const [learningProgress, setLearningProgress] = useState<LearningProgress>(DEFAULT_LEARNING_PROGRESS)
  const [roundNotice, setRoundNotice] = useState('')
  const [showMasteredModal, setShowMasteredModal] = useState(false)
  const [examDate, setExamDate] = useState(() => {
    try {
      return localStorage.getItem(EXAM_DATE_KEY) || defaultExamDate()
    } catch {
      return defaultExamDate()
    }
  })
  const [apiKey, setApiKey] = useState(() => getApiKey())
  const [overview, setOverview] = useState(readOverview)
  const [srsTick, setSrsTick] = useState(0)
  const [wrongQuizMode, setWrongQuizMode] = useState(false)
  const [wrongQuizIndex, setWrongQuizIndex] = useState(0)
  const [wrongQuizDueOnly, setWrongQuizDueOnly] = useState(false)
  const [wrongQuizCorrect, setWrongQuizCorrect] = useState(0)
  const [wrongQuizWrong, setWrongQuizWrong] = useState(0)
  const [wrongQuizFinished, setWrongQuizFinished] = useState(false)
  const [wrongQuizCurrentRemoved, setWrongQuizCurrentRemoved] = useState(false)
  const [, setWrongQuizStreaks] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!isSyncEnabled()) return
    void runCloudSync(true).then((res) => {
      if (res.ok && res.appliedRemote) window.location.reload()
    })
  }, [])

  useEffect(() => {
    if (!isSyncEnabled()) return
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void runCloudSync(true).then((res) => {
          if (res.ok && res.appliedRemote) window.location.reload()
        })
      } else {
        scheduleCloudPush(0)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  useEffect(() => {
    void warmUpSpeech()
  }, [])

  useEffect(() => {
    if (getReminderEnabled()) void scheduleDailyReminder()
  }, [])

  const sk = useCallback(
    (base: string) => storageKey(currentLibrary, base),
    [currentLibrary],
  )

  const reloadLibraryState = useCallback((library: WordLibrary) => {
    migrateLegacyStorage(library, [
      STORAGE.mastered,
      STORAGE.wrong,
      STORAGE.learnIndex,
      STORAGE.sentenceCache,
      STORAGE.displayMode,
      STORAGE.dailyTask,
      STORAGE.wordStates,
      STORAGE.learningProgress,
    ])
    setMasteredRecords(loadJson(storageKey(library, STORAGE.mastered), []))
    setWrongMap(loadJson(storageKey(library, STORAGE.wrong), {}))
    setLearnIndex(loadJson(storageKey(library, STORAGE.learnIndex), 0))
    setSentenceCache(loadJson(storageKey(library, STORAGE.sentenceCache), {}))
    setDisplayMode(loadJson(storageKey(library, STORAGE.displayMode), 'both'))
    setDailyTask(loadJson(storageKey(library, STORAGE.dailyTask), DEFAULT_DAILY_TASK))
    setWordStates(loadJson(storageKey(library, STORAGE.wordStates), {}))
    setLearningProgress(
      loadJson(storageKey(library, STORAGE.learningProgress), DEFAULT_LEARNING_PROGRESS),
    )
  }, [])

  const loadWordLibrary = useCallback(
    async (library: WordLibrary) => {
      setIsLibraryLoading(true)
      setWordsReady(false)
      try {
        const data = await fetchWordLibrary(library)
        const loaded = loadWordsFromJson(data)
        setWords(loaded)
        reloadLibraryState(library)
        if (loaded.length) {
          const wrongKey = storageKey(library, STORAGE.wrong)
          const raw = loadJson<Record<string, number>>(wrongKey, {})
          const migrated = loadWrongMap(loaded, wrongKey)
          const normalizedWrong = normalizeWrongMap({ ...migrated, ...raw }, loaded)
          saveJson(wrongKey, normalizedWrong)
          setWrongMap(normalizedWrong)

          const masteredIds = loadJson<Array<{ id: string }>>(
            storageKey(library, STORAGE.mastered),
            [],
          ).map((r) => r.id)
          const statesKey = storageKey(library, STORAGE.wordStates)
          let states = loadJson<Record<string, WordLearningState>>(statesKey, {})
          if (!Object.keys(states).length) {
            states = initWordStates(loaded)
          }
          states = migrateWordStates(loaded, states, masteredIds, normalizedWrong)
          saveJson(statesKey, states)
          setWordStates(states)

          const reconciledMastered = buildMasteredRecords(loaded, states)
          saveJson(storageKey(library, STORAGE.mastered), reconciledMastered)
          setMasteredRecords(reconciledMastered)

          const progressKey = storageKey(library, STORAGE.learningProgress)
          const savedProgress = loadJson<LearningProgress | null>(progressKey, null)
          const queue = getLearningQueue(loaded, states, savedProgress?.currentRound ?? 1)
          const progress =
            savedProgress ??
            computeLearningProgress(
              loaded,
              states,
              1,
              queue,
              loadJson(storageKey(library, STORAGE.learnIndex), 0),
            )
          progress.totalWords = loaded.length
          progress.masteredWords = countMasteredFromStates(loaded, states)
          progress.remainingWords = queue.length
          saveJson(progressKey, progress)
          setLearningProgress(progress)
        }
      } catch (error) {
        console.error('词库加载失败:', error)
        if (library !== 'all') {
          writeLibraryChoice('all')
          setCurrentLibrary('all')
          return
        }
        setWords([])
      } finally {
        setIsLibraryLoading(false)
        setWordsReady(true)
        setOverview(readOverview())
      }
    },
    [reloadLibraryState],
  )

  useEffect(() => {
    void loadWordLibrary(currentLibrary)
  }, [currentLibrary, loadWordLibrary])

  const switchLibrary = useCallback(
    (newLibrary: WordLibrary) => {
      if (newLibrary === currentLibrary || isLibraryLoading) return
      setTab('learn')
      writeLibraryChoice(newLibrary)
      setCurrentLibrary(newLibrary)
    },
    [currentLibrary, isLibraryLoading],
  )

  const masteredWords = useMemo(() => {
    return words
      .filter((w) => wordStates[w.word]?.status === 'mastered')
      .sort(
        (a, b) =>
          (wordStates[b.word]?.lastLearnedAt ?? 0) -
          (wordStates[a.word]?.lastLearnedAt ?? 0),
      )
  }, [words, wordStates])

  const wrongWords = useMemo(() => {
    const seen = new Set<string>()
    const list: Word[] = []
    for (const [id] of Object.entries(wrongMap).sort(([, a], [, b]) => b - a)) {
      const w = resolveWordByIdOrLegacy(id, words)
      if (!w || seen.has(w.id)) continue
      seen.add(w.id)
      list.push(w)
    }
    return list
  }, [wrongMap, words])

  const masteredIds = useMemo(
    () => new Set(masteredWords.map((w) => w.id)),
    [masteredWords],
  )

  const wrongIds = useMemo(
    () => new Set(wrongWords.map((w) => w.id)),
    [wrongWords],
  )

  const dueSrsWords = useMemo(() => {
    return getDueSrsIds()
      .map((id) => resolveWordByIdOrLegacy(id, words))
      .filter((w): w is Word => Boolean(w))
  }, [words, srsTick])

  const allSrsEntries = useMemo(() => getAllSrsEntries(), [srsTick])
  const nextSrsEntry = useMemo(() => getNextSrsEntry(), [srsTick])
  const statsSummary = useMemo(() => getStatsSummary(), [srsTick, wordStates, wrongMap])

  const orphanWrongCount = useMemo(() => {
    return Object.entries(wrongMap).filter(
      ([id, count]) => (count ?? 0) > 0 && !resolveWordByIdOrLegacy(id, words),
    ).length
  }, [wrongMap, words])

  const reviewGroups: SentenceGroup[] = useMemo(() => {
    return chunkWords(masteredWords).map((words, i) => ({
      key: `g${i}-${words.map((w) => w.id).join('-')}`,
      words,
    }))
  }, [masteredWords])

  const wrongGroups: SentenceGroup[] = useMemo(() => {
    return chunkWords(wrongWords).map((words, i) => ({
      key: `g${i}-${words.map((w) => w.id).join('-')}`,
      words,
    }))
  }, [wrongWords])

  const wrongQuizWords = useMemo(
    () => (wrongQuizDueOnly ? dueSrsWords : wrongWords),
    [wrongQuizDueOnly, dueSrsWords, wrongWords],
  )

  const recentMasteredWords = useMemo(() => masteredWords.slice(0, 8), [masteredWords])

  const wrongQuizProgress = useMemo<LearningProgress>(
    () => ({
      currentRound: 1,
      totalRounds: 1,
      roundProgress: Math.min(wrongQuizIndex, wrongQuizWords.length),
      totalWords: wrongQuizWords.length,
      masteredWords: Math.min(wrongQuizIndex, wrongQuizWords.length),
      remainingWords: wrongQuizWords.length,
    }),
    [wrongQuizIndex, wrongQuizWords.length],
  )

  const learningQueue = useMemo(
    () => getLearningQueue(words, wordStates, learningProgress.currentRound),
    [words, wordStates, learningProgress.currentRound],
  )

  const liveProgress = useMemo(
    () =>
      computeLearningProgress(
        words,
        wordStates,
        learningProgress.currentRound,
        learningQueue,
        learnIndex,
      ),
    [words, wordStates, learningProgress.currentRound, learningQueue, learnIndex],
  )

  const allMastered = useMemo(
    () => isAllMastered(words, wordStates),
    [words, wordStates],
  )

  useEffect(() => {
    if (!learningQueue.length) return
    if (learnIndex >= learningQueue.length) {
      setLearnIndex(0)
      saveJson(sk(STORAGE.learnIndex), 0)
    }
  }, [learningQueue.length, learnIndex, sk])

  useEffect(() => {
    if (!wrongQuizWords.length) {
      setWrongQuizMode(false)
      setWrongQuizIndex(0)
      return
    }
    if (wrongQuizIndex >= wrongQuizWords.length) setWrongQuizIndex(0)
  }, [wrongQuizWords.length, wrongQuizIndex])

  useEffect(() => {
    if (!words.length) return
    const progressKey = sk(STORAGE.learningProgress)
    const next = {
      ...liveProgress,
      currentRound: learningProgress.currentRound,
      totalRounds: TOTAL_ROUNDS,
    }
    saveJson(progressKey, next)
  }, [liveProgress, learningProgress.currentRound, sk, words.length])

  const bumpDailyTask = useCallback(
    (count: number) => {
      if (currentLibrary !== 'all' || !words.length || count <= 0) return
      setDailyTask((prev) => {
        const next = advanceDailyTaskByCount(prev, currentLibrary, words.length, count)
        saveJson(sk(STORAGE.dailyTask), next)
        return next
      })
    },
    [currentLibrary, words.length, sk],
  )

  const dailyTaskInfo = useMemo(() => {
    if (currentLibrary !== 'all' || !words.length) return undefined
    const dailyTarget = getDailyTarget(currentLibrary, words.length, dailyTask)
    const today = new Date().toISOString().slice(0, 10)
    const todayWords = dailyTask.todayDate === today ? dailyTask.todayWords || 0 : 0
    return {
      todayWords,
      dailyTarget,
      completedDays: dailyTask.completedDays || 0,
    }
  }, [currentLibrary, words.length, dailyTask])

  const syncMasteredRecord = useCallback(
    (id: string) => {
      setMasteredRecords((prev) => {
        const filtered = prev.filter((r) => r.id !== id)
        const next = [{ id, at: Date.now() }, ...filtered]
        saveJson(sk(STORAGE.mastered), next)
        return next
      })
      setOverview(readOverview())
    },
    [sk],
  )

  const handleLearnCorrect = useCallback(
    (word: Word) => {
      let shouldSyncMastered = false
      setWordStates((prev) => {
        const base = prev[word.word] ?? defaultWordState(word.word)
        const updated = applyCorrect(base, learningProgress.currentRound)
        if (updated.status === 'mastered') shouldSyncMastered = true
        const next = { ...prev, [word.word]: updated }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      if (shouldSyncMastered) {
        syncMasteredRecord(word.id)
        bumpDailyTask(1)
      }
      recordStudyEvent('correct')
      if (getSrsEntry(word.id)) {
        advanceSrs(word.id)
        setSrsTick((t) => t + 1)
      }
    },
    [learningProgress.currentRound, sk, syncMasteredRecord, bumpDailyTask],
  )

  const handleLearnWrong = useCallback(
    (word: Word) => {
      const round = learningProgress.currentRound
      setWordStates((prev) => {
        const base = prev[word.word] ?? defaultWordState(word.word)
        const next = { ...prev, [word.word]: applyWrong(base, round) }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      setWrongMap((prev) => {
        const next = { ...prev, [word.id]: (prev[word.id] ?? 0) + 1 }
        saveJson(sk(STORAGE.wrong), next)
        return next
      })
      recordSrsWrong(word.id)
      recordStudyEvent('wrong')
      setSrsTick((t) => t + 1)
      setOverview(readOverview())
    },
    [learningProgress.currentRound, sk],
  )

  const handleSrsRemembered = useCallback(
    (word: Word) => {
      let shouldSyncMastered = false
      advanceSrs(word.id)
      setWordStates((prev) => {
        const base = prev[word.word] ?? defaultWordState(word.word)
        const updated = applyCorrect(base, learningProgress.currentRound)
        if (updated.status === 'mastered') shouldSyncMastered = true
        const next = { ...prev, [word.word]: updated }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      setWrongMap((prev) => {
        if (!prev[word.id]) return prev
        const next = { ...prev }
        delete next[word.id]
        saveJson(sk(STORAGE.wrong), next)
        return next
      })
      if (shouldSyncMastered) syncMasteredRecord(word.id)
      recordStudyEvent('correct')
      recordStudyEvent('review')
      setSrsTick((t) => t + 1)
      setOverview(readOverview())
    },
    [learningProgress.currentRound, sk, syncMasteredRecord],
  )

  const handleMarkMastered = useCallback(
    (word: Word) => {
      let wasNew = false
      setWordStates((prev) => {
        const base = prev[word.word] ?? defaultWordState(word.word)
        if (base.status === 'mastered') return prev
        wasNew = true
        const next = { ...prev, [word.word]: markMasteredState(base) }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      if (wasNew) {
        syncMasteredRecord(word.id)
        bumpDailyTask(1)
      }
    },
    [sk, syncMasteredRecord, bumpDailyTask],
  )

  const handleBatchMarkMastered = useCallback(
    (count: number) => {
      if (!words.length) return
      const targets = words.slice(0, count)
      const toMark = targets.filter((w) => {
        const base = wordStates[w.word] ?? defaultWordState(w.word)
        return base.status !== 'mastered'
      })
      if (!toMark.length) return

      setWordStates((prev) => {
        const next = { ...prev }
        for (const w of toMark) {
          next[w.word] = markMasteredState(next[w.word] ?? defaultWordState(w.word))
        }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      for (const w of toMark) {
        syncMasteredRecord(w.id)
      }
      bumpDailyTask(toMark.length)
    },
    [words, sk, syncMasteredRecord, bumpDailyTask, wordStates],
  )

  const handleLearnNext = useCallback(() => {
    const nextIndex = learnIndex + 1
    const mastered = countMasteredFromStates(words, wordStates)

    if (
      canAdvanceRound(
        learningProgress.currentRound,
        learningQueue.length,
        nextIndex,
        mastered,
        words.length,
      )
    ) {
      const finishedRound = learningProgress.currentRound
      const newRound = finishedRound + 1
      setLearningProgress((prev) => ({
        ...prev,
        currentRound: newRound,
        roundProgress: 0,
        masteredWords: mastered,
        remainingWords: getLearningQueue(words, wordStates, newRound).length,
      }))
      saveJson(sk(STORAGE.learningProgress), {
        ...liveProgress,
        currentRound: newRound,
        roundProgress: 0,
        masteredWords: mastered,
        remainingWords: getLearningQueue(words, wordStates, newRound).length,
      })
      setLearnIndex(0)
      saveJson(sk(STORAGE.learnIndex), 0)
      setRoundNotice(
        `第 ${finishedRound} 轮完成！已掌握 ${mastered}/${words.length}。进入第 ${newRound} 轮，只复习未掌握的单词。`,
      )
      return
    }

    const clamped = Math.min(nextIndex, Math.max(0, learningQueue.length - 1))
    setLearnIndex(clamped)
    saveJson(sk(STORAGE.learnIndex), clamped)
  }, [
    learnIndex,
    wordStates,
    words,
    learningProgress.currentRound,
    learningQueue.length,
    liveProgress,
    sk,
  ])

  const handleResetProgress = useCallback(() => {
    if (!window.confirm('确定要重置所有学习进度吗？此操作不可恢复！')) return
    localStorage.removeItem(sk(STORAGE.wordStates))
    localStorage.removeItem(sk(STORAGE.learningProgress))
    localStorage.removeItem(sk(STORAGE.learnIndex))
    localStorage.removeItem(sk(STORAGE.mastered))
    const fresh = initWordStates(words)
    setWordStates(fresh)
    setLearningProgress({
      ...DEFAULT_LEARNING_PROGRESS,
      totalWords: words.length,
      remainingWords: words.length,
    })
    setLearnIndex(0)
    setMasteredRecords([])
    setRoundNotice('')
    saveJson(sk(STORAGE.wordStates), fresh)
    saveJson(sk(STORAGE.learningProgress), {
      ...DEFAULT_LEARNING_PROGRESS,
      totalWords: words.length,
      remainingWords: words.length,
    })
    saveJson(sk(STORAGE.learnIndex), 0)
    saveJson(sk(STORAGE.mastered), [])
    setOverview(readOverview())
  }, [sk, words])

  const aiStatus = useMemo<'connected' | 'local' | 'unknown'>(() => {
    if (!apiKey) return 'unknown'
    const entries = Object.values(sentenceCache)
    if (!entries.length) return 'unknown'
    return entries.some((e) => e.source === 'ai') ? 'connected' : 'local'
  }, [apiKey, sentenceCache])

  const handleClearWrongItem = useCallback(
    (id: string) => {
      setWrongMap((prev) => {
        if (!prev[id]) return prev
        const next = { ...prev }
        delete next[id]
        saveJson(sk(STORAGE.wrong), next)
        return next
      })
      removeSrsEntry(id)
      setSrsTick((t) => t + 1)
      setOverview(readOverview())
    },
    [sk],
  )

  const handleClearWrong = () => {
    clearSrsEntries(Object.keys(wrongMap))
    setWrongMap({})
    saveJson(sk(STORAGE.wrong), {})
    setSrsTick((t) => t + 1)
    setOverview(readOverview())
  }

  const startWrongQuiz = useCallback((dueOnly = false) => {
    setWrongQuizDueOnly(dueOnly)
    setWrongQuizMode(true)
    setWrongQuizIndex(0)
    setWrongQuizCorrect(0)
    setWrongQuizWrong(0)
    setWrongQuizFinished(false)
    setWrongQuizCurrentRemoved(false)
    setTab('wrong')
  }, [])

  const handleWrongQuizNext = useCallback(() => {
    setWrongQuizIndex((i) => {
      if (wrongQuizCurrentRemoved) {
        setWrongQuizCurrentRemoved(false)
        if (wrongQuizWords.length === 0 || i >= wrongQuizWords.length) {
          setWrongQuizFinished(true)
          return Math.max(0, wrongQuizWords.length - 1)
        }
        return i
      }
      const next = i + 1
      if (next >= wrongQuizWords.length) {
        setWrongQuizFinished(true)
        return i
      }
      return next
    })
  }, [wrongQuizCurrentRemoved, wrongQuizWords.length])

  const handleWrongQuizCorrect = useCallback(
    (word: Word) => {
      let shouldSyncMastered = false
      const advancedEntry = advanceSrs(word.id)
      setWordStates((prev) => {
        const base = prev[word.word] ?? defaultWordState(word.word)
        const updated = applyCorrect(base, learningProgress.currentRound)
        if (updated.status === 'mastered') shouldSyncMastered = true
        const next = { ...prev, [word.word]: updated }
        saveJson(sk(STORAGE.wordStates), next)
        return next
      })
      if (shouldSyncMastered) syncMasteredRecord(word.id)

      setWrongQuizCorrect((n) => n + 1)
      setWrongQuizStreaks((prev) => {
        const streak = (prev[word.id] ?? 0) + 1
        const confirmedStreak = Math.max(streak, advancedEntry?.correctStreak ?? 0)
        const next = { ...prev, [word.id]: streak }
        if (confirmedStreak >= 2) {
          setWrongMap((wrongPrev) => {
            if (!wrongPrev[word.id]) return wrongPrev
            const wrongNext = { ...wrongPrev }
            delete wrongNext[word.id]
            saveJson(sk(STORAGE.wrong), wrongNext)
            return wrongNext
          })
          removeSrsEntry(word.id)
          setWrongQuizCurrentRemoved(true)
        }
        return next
      })
      recordStudyEvent('correct')
      recordStudyEvent('review')
      setSrsTick((t) => t + 1)
      setOverview(readOverview())
    },
    [learningProgress.currentRound, sk, syncMasteredRecord],
  )

  const handleWrongQuizWrong = useCallback(
    (word: Word) => {
      setWrongQuizWrong((n) => n + 1)
      setWrongQuizStreaks((prev) => ({ ...prev, [word.id]: 0 }))
      handleLearnWrong(word)
    },
    [handleLearnWrong],
  )

  const handleStartLearningFromWord = useCallback(
    (word: Word) => {
      const index = learningQueue.findIndex((w) => w.id === word.id || w.word === word.word)
      setLearnIndex(index >= 0 ? index : 0)
      saveJson(sk(STORAGE.learnIndex), index >= 0 ? index : 0)
      setTab('learn')
    },
    [learningQueue, sk],
  )

  const handleSaveApiKey = (key: string) => {
    setApiKey(key)
    if (key) localStorage.setItem(STORAGE.apiKey, key)
    else localStorage.removeItem(STORAGE.apiKey)
  }

  const handleDisplayModeChange = (m: DisplayMode) => {
    setDisplayMode(m)
    saveJson(sk(STORAGE.displayMode), m)
  }

  const hfPlanStats = useMemo(() => {
    const progress = loadJson<LearningProgress>(
      storageKey('high-frequency', STORAGE.learningProgress),
      DEFAULT_LEARNING_PROGRESS,
    )
    return {
      round: progress.currentRound,
      mastered: overview.hfMastered,
      wrong: overview.hfWrong,
    }
  }, [overview, learningProgress, wordStates])

  const handleExamDateChange = useCallback((date: string) => {
    setExamDate(date)
    try {
      localStorage.setItem(EXAM_DATE_KEY, date)
    } catch {
      /* ignore */
    }
  }, [])

  const libTheme = LIBRARY_META[currentLibrary].theme
  const hfTotal =
    currentLibrary === 'high-frequency' && words.length ? words.length : 1000
  const allTotal = currentLibrary === 'all' && words.length ? words.length : 4400
  const moreActive = tab === 'articles' || tab === 'essays' || tab === 'stats'
  const moreLabel =
    tab === 'articles' ? '阅读' : tab === 'essays' ? '作文' : tab === 'stats' ? '数据' : '更多'

  return (
    <div className="app-viewport">
      <div className={`app-shell app-shell--${tab}`}>
        <header className="app-header">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h1 className="study-brand-title">四级背单词</h1>
              <p className="study-brand-tagline">
                {LIBRARY_META[currentLibrary].label}
                {isLibraryLoading ? ' · 加载中…' : ''}
              </p>
            </div>
            <AppSettings apiKey={apiKey} onSave={handleSaveApiKey} aiStatus={aiStatus} />
          </div>
          {tab === 'learn' && (
            <p className="study-motivation">
              ✨ 每天背一点，离四级及格线更近一步
            </p>
          )}
          <div className="app-segment mt-3">
            {(['high-frequency', 'all'] as const).map((lib) => (
              <button
                key={lib}
                type="button"
                onClick={() => switchLibrary(lib)}
                disabled={isLibraryLoading}
                className={`app-segment-btn ${
                  currentLibrary === lib
                    ? lib === 'high-frequency'
                      ? 'app-segment-btn--active-hf'
                      : 'app-segment-btn--active-all'
                    : ''
                }`}
              >
                {lib === 'high-frequency' ? '高频冲刺' : '全词库'}
              </button>
            ))}
          </div>
        </header>

        <main className="app-content">
          {tab === 'learn' && (
            <>
              <div className="study-dashboard app-card mb-3 p-4">
                <p className="study-dashboard-title">
                  <span>📈</span> 学习概览
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-2xl bg-indigo-50/80 p-3">
                    <p className="text-xs font-semibold text-indigo-600">高频词</p>
                    <p className="mt-1 text-lg font-bold text-slate-800">
                      {overview.hfMastered}
                      <span className="text-sm font-normal text-slate-400">/{hfTotal}</span>
                    </p>
                    <ProgressBar
                      value={overview.hfMastered}
                      max={hfTotal}
                      color="#6366f1"
                    />
                    <p className="mt-2 text-[11px] text-indigo-400">错词 {overview.hfWrong}</p>
                  </div>
                  <div className="rounded-2xl bg-emerald-50/80 p-3">
                    <p className="text-xs font-semibold text-emerald-600">全词库</p>
                    <p className="mt-1 text-lg font-bold text-slate-800">
                      {overview.allMastered}
                      <span className="text-sm font-normal text-slate-400">/{allTotal}</span>
                    </p>
                    <ProgressBar
                      value={overview.allMastered}
                      max={allTotal}
                      color="#10b981"
                    />
                    <p className="mt-2 text-[11px] text-emerald-500">错词 {overview.allWrong}</p>
                  </div>
                </div>
              </div>
              {dailyTaskInfo && dailyTaskInfo.todayWords >= dailyTaskInfo.dailyTarget && (
                <div className="app-card mb-3 border border-emerald-200 bg-emerald-50/80 p-4">
                  <p className="text-sm font-semibold text-emerald-700">今日完成 ✓</p>
                  <p className="mt-1 text-xs text-emerald-800">
                    新掌握 {dailyTaskInfo.todayWords} 词 · 还剩错词 {overview.totalWrong} 个，建议去错词页巩固一轮。
                  </p>
                </div>
              )}
              {wordsReady && words.length > 0 ? (
                <LearnTab
                  queue={learningQueue}
                  allWords={words}
                  learnIndex={learnIndex}
                  onNext={handleLearnNext}
                  onCorrect={handleLearnCorrect}
                  onWrong={handleLearnWrong}
                  onClearWrong={handleClearWrongItem}
                  onMarkMastered={handleMarkMastered}
                  progress={liveProgress}
                  libraryTheme={libTheme}
                  learningComplete={allMastered}
                  onResetProgress={handleResetProgress}
                  onBatchMarkMastered={handleBatchMarkMastered}
                  dailyTaskInfo={dailyTaskInfo}
                />
              ) : (
                <div className="app-card flex min-h-[40vh] items-center justify-center p-8">
                  <p className="text-sm text-slate-400">
                    {wordsReady ? '词库为空' : '词库加载中…'}
                  </p>
                </div>
              )}
            </>
          )}

          {tab === 'review' && (
            <>
              <div className="app-card mb-3 border border-violet-100 bg-violet-50/70 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-violet-700">复习中心</p>
                    <p className="mt-1 text-xs text-violet-800">
                      今日应复习 {dueSrsWords.length} 个 · 今日已复习 {statsSummary.today.reviewed} 个 · 已安排 {allSrsEntries.length} 个
                    </p>
                    <p className="mt-1 text-xs text-violet-700">
                      下次复习：{nextSrsEntry ? formatNextReview(nextSrsEntry.nextReview) : '暂无安排'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => startWrongQuiz(true)}
                    disabled={dueSrsWords.length === 0}
                    className="shrink-0 rounded-xl bg-violet-500 px-3 py-2 text-xs font-medium text-white card-press disabled:opacity-50"
                  >
                    一键复习今日队列
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-white/80 px-2 py-2">
                    <p className="text-[11px] text-violet-400">今日应复习</p>
                    <p className="text-lg font-semibold text-violet-700">{dueSrsWords.length}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-2 py-2">
                    <p className="text-[11px] text-violet-400">今日已复习</p>
                    <p className="text-lg font-semibold text-violet-700">{statsSummary.today.reviewed}</p>
                  </div>
                  <div className="rounded-xl bg-white/80 px-2 py-2">
                    <p className="text-[11px] text-violet-400">最近掌握</p>
                    <p className="text-lg font-semibold text-violet-700">{recentMasteredWords.length}</p>
                  </div>
                </div>
              </div>
              {masteredWords.length > 0 && (
                <div className="app-card mb-3 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-emerald-600">
                        最近掌握词回顾
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">
                        已掌握 {masteredWords.length} 个 · 按掌握时间排序
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMasteredModal(true)}
                        className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white card-press"
                      >
                        一键复习已掌握词
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowMasteredModal(true)}
                        className="rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 card-press"
                      >
                        查看列表
                      </button>
                    </div>
                  </div>
                  {recentMasteredWords.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {recentMasteredWords.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => speakWord(w.word)}
                          className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 card-press"
                        >
                          {w.word}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <SentencePanel
                groups={reviewGroups}
                cachePrefix={`${currentLibrary}-review`}
                displayMode={displayMode}
                onDisplayModeChange={handleDisplayModeChange}
                sentenceCache={sentenceCache}
                setSentenceCache={setSentenceCache}
                sentenceCacheKey={sk(STORAGE.sentenceCache)}
                theme="review"
                emptyText="学习页答对 1 次后，单词会出现在这里"
                apiKey={apiKey}
              />
            </>
          )}

          {tab === 'words' && (
            <WordsTab
              words={words}
              masteredIds={masteredIds}
              wrongIds={wrongIds}
              loading={!wordsReady || isLibraryLoading}
              onSpeak={speakWord}
              onAddWrong={handleLearnWrong}
              onMarkMastered={handleMarkMastered}
              onStartLearning={handleStartLearningFromWord}
            />
          )}

          {tab === 'articles' && <ArticlesTab apiKey={apiKey} />}

          {tab === 'essays' && <EssaysTab />}

          {tab === 'stats' && (
            <StatsTab
              examDate={examDate}
              onExamDateChange={handleExamDateChange}
              scheduleCtx={{
                examDate,
                hfMastered: hfPlanStats.mastered,
                hfTotal: hfTotal,
                hfWrong: hfPlanStats.wrong,
                currentRound: hfPlanStats.round,
              }}
              apiKey={apiKey}
              onGoLearn={() => {
                writeLibraryChoice('high-frequency')
                setCurrentLibrary('high-frequency')
                setTab('learn')
              }}
              onGoReview={() => {
                writeLibraryChoice('high-frequency')
                setCurrentLibrary('high-frequency')
                setTab('review')
              }}
              onGoWrong={() => {
                writeLibraryChoice('high-frequency')
                setCurrentLibrary('high-frequency')
                setTab('wrong')
              }}
            />
          )}

          {tab === 'wrong' && (
            <>
              {wrongQuizMode && wrongQuizWords.length > 0 ? (
                <div className="space-y-3">
                  <div className="app-card flex items-center justify-between gap-3 p-4">
                    <div>
                      <p className="text-sm font-semibold text-orange-700">错词测验</p>
                      <p className="mt-1 text-xs text-orange-500">
                        答对会移出错词，答错继续保留。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setWrongQuizMode(false)}
                      className="rounded-lg bg-stone-100 px-3 py-1.5 text-xs text-stone-600 card-press"
                    >
                      退出
                    </button>
                  </div>
                  <div className="app-card grid grid-cols-3 gap-2 p-3 text-center">
                    <div>
                      <p className="text-[11px] text-slate-400">本轮答对</p>
                      <p className="text-lg font-semibold text-emerald-600">{wrongQuizCorrect}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">本轮答错</p>
                      <p className="text-lg font-semibold text-orange-600">{wrongQuizWrong}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-400">范围</p>
                      <p className="text-sm font-semibold text-slate-700">
                        {wrongQuizDueOnly ? '今日到期' : '全部错词'}
                      </p>
                    </div>
                  </div>
                  {wrongQuizFinished ? (
                    <div className="app-card p-5 text-center">
                      <p className="text-lg font-semibold text-slate-900">本轮测验完成</p>
                      <p className="mt-2 text-sm text-slate-500">
                        答对 {wrongQuizCorrect} 个，答错 {wrongQuizWrong} 个。
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        连续答对 2 次的词已自动移出错词，其余继续留在复习队列。
                      </p>
                      <div className="mt-4 flex justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => startWrongQuiz(wrongQuizDueOnly)}
                          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-white card-press"
                        >
                          再测一轮
                        </button>
                        <button
                          type="button"
                          onClick={() => setWrongQuizMode(false)}
                          className="rounded-lg bg-stone-100 px-4 py-2 text-sm text-stone-600 card-press"
                        >
                          返回错词
                        </button>
                      </div>
                    </div>
                  ) : (
                  <LearnTab
                    queue={wrongQuizWords}
                    allWords={words}
                    learnIndex={wrongQuizIndex}
                    onNext={handleWrongQuizNext}
                    onCorrect={handleWrongQuizCorrect}
                    onWrong={handleWrongQuizWrong}
                    onClearWrong={() => {}}
                    onMarkMastered={handleMarkMastered}
                    progress={wrongQuizProgress}
                    libraryTheme={libTheme}
                    learningComplete={wrongQuizWords.length === 0}
                    onResetProgress={() => setWrongQuizFinished(true)}
                    onBatchMarkMastered={() => {}}
                  />
                  )}
                </div>
              ) : (
              <>
              {dueSrsWords.length > 0 && (
                <div className="app-card mb-3 border border-violet-200 bg-violet-50/80 p-4">
                  <p className="mb-3 text-sm font-semibold text-violet-700">
                    今日间隔复习 {dueSrsWords.length}
                  </p>
                  <button
                    type="button"
                    onClick={() => startWrongQuiz(true)}
                    className="mb-3 rounded-lg bg-violet-500 px-3 py-1.5 text-xs font-medium text-white card-press"
                  >
                    只测今日到期错词
                  </button>
                  <div className="space-y-2">
                    {dueSrsWords.map((w) => {
                      const entry = getSrsEntry(w.id)
                      return (
                        <div
                          key={w.id}
                          className="flex items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-800">{w.word}</p>
                            <p className="truncate text-xs text-slate-500">{w.meaning}</p>
                            {entry && (
                              <p className="text-[10px] text-violet-500">
                                第 {entry.level + 1} 轮 · {formatNextReview(entry.nextReview)}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => speakWord(w.word)}
                              className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 card-press"
                            >
                              发音
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSrsRemembered(w)}
                              className="rounded-lg bg-violet-500 px-2.5 py-1 text-xs font-medium text-white card-press"
                            >
                              记住了
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              {orphanWrongCount > 0 && (
                <div className="app-card mb-3 border border-orange-200 bg-orange-50/80 p-3 text-xs text-orange-700">
                  有 {orphanWrongCount} 个历史错词无法匹配当前词库，请在学习页重新答错以收录。
                </div>
              )}
              {wrongWords.length > 0 && (
                <div className="app-card mb-3 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-semibold text-orange-600">
                      错词 {wrongWords.length}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => startWrongQuiz(false)}
                        className="rounded-lg bg-orange-500 px-3 py-1 text-xs font-medium text-white card-press"
                      >
                        开始错词测验
                      </button>
                      <button
                        type="button"
                        onClick={handleClearWrong}
                        className="rounded-lg bg-orange-100 px-3 py-1 text-xs font-medium text-orange-600 card-press"
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {wrongWords.map((w) => (
                      <span
                        key={w.id}
                        className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-xs text-orange-800"
                      >
                        <strong>{w.word}</strong>
                        <span className="text-orange-400">×{wrongMap[w.id]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <SentencePanel
                groups={wrongGroups}
                cachePrefix={`${currentLibrary}-wrong`}
                displayMode={displayMode}
                onDisplayModeChange={handleDisplayModeChange}
                sentenceCache={sentenceCache}
                setSentenceCache={setSentenceCache}
                sentenceCacheKey={sk(STORAGE.sentenceCache)}
                theme="wrong"
                emptyText="当前没有错词，继续加油！"
                apiKey={apiKey}
              />
              </>
              )}
            </>
          )}
        </main>

        {moreOpen && (
          <button
            type="button"
            className="app-more-backdrop"
            aria-label="关闭更多功能"
            onClick={() => setMoreOpen(false)}
          />
        )}
        {moreOpen && (
          <div className="app-more-panel" role="dialog" aria-label="更多功能">
            {(
              [
                { key: 'articles', label: '阅读', desc: '长文精读与高频词高亮' },
                { key: 'essays', label: '作文', desc: '模板、草稿与真题训练' },
                { key: 'stats', label: '数据', desc: '学习统计与考试计划' },
              ] as const
            ).map(({ key, label, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setTab(key)
                  setMoreOpen(false)
                }}
                className={`app-more-item ${tab === key ? 'app-more-item--active' : ''}`}
              >
                <span className="app-more-item-icon">
                  <TabIcon tab={key} active={tab === key} />
                </span>
                <span className="min-w-0 text-left">
                  <span className="block text-sm font-semibold">{label}</span>
                  <span className="block truncate text-xs opacity-70">{desc}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <nav className="app-tabbar" aria-label="主导航">
          {(
            [
              { key: 'learn', label: '学习' },
              { key: 'review', label: '复习' },
              { key: 'wrong', label: '错词' },
              { key: 'words', label: '词表' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key)
                setMoreOpen(false)
              }}
              className={`app-tab ${tab === key ? 'app-tab--active' : ''} ${
                tab === key && key === 'review'
                  ? 'tab-review'
                  : tab === key && key === 'wrong'
                    ? 'tab-wrong'
                    : ''
              }`}
            >
              <span className="app-tab-icon relative">
                <TabIcon tab={key} active={tab === key} />
                {key === 'wrong' && (overview.totalWrong > 0 || dueSrsWords.length > 0) && (
                  <span
                    className={`app-tab-badge ${dueSrsWords.length > 0 ? 'bg-violet-500' : ''}`}
                  >
                    {dueSrsWords.length > 0
                      ? dueSrsWords.length > 99
                        ? '99+'
                        : dueSrsWords.length
                      : overview.totalWrong > 99
                        ? '99+'
                        : overview.totalWrong}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            className={`app-tab ${
              moreOpen || moreActive
                ? 'app-tab--active tab-more'
                : ''
            }`}
          >
            <span className="app-tab-icon relative">
              <MoreIcon active={moreOpen || moreActive} />
            </span>
            <span>{moreLabel}</span>
          </button>
        </nav>
      </div>
      {roundNotice && (
        <AppToast message={roundNotice} onDismiss={() => setRoundNotice('')} />
      )}
      {showMasteredModal && (
        <MasteredWordsModal
          words={masteredWords}
          onClose={() => setShowMasteredModal(false)}
        />
      )}
    </div>
  )
}
