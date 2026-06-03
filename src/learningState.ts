/** 单词学习状态与多轮队列逻辑 */

export type WordStatus = 'unlearned' | 'learning' | 'mastered'

export interface WordLearningState {
  wordId: string
  status: WordStatus
  learningRound: number
  correctCount: number
  consecutiveCorrect: number
  wrongCount: number
  lastLearnedAt: number
  firstLearnedAt: number
}

export interface LearningProgress {
  currentRound: number
  totalRounds: number
  roundProgress: number
  totalWords: number
  masteredWords: number
  remainingWords: number
}

export const TOTAL_ROUNDS = 3
/** 答对 1 次即视为掌握，进入复习。 */
export const MASTER_CORRECT_THRESHOLD = 1
export const MASTER_CONSECUTIVE_THRESHOLD = 1

export function defaultWordState(wordId: string): WordLearningState {
  return {
    wordId,
    status: 'unlearned',
    learningRound: 0,
    correctCount: 0,
    consecutiveCorrect: 0,
    wrongCount: 0,
    lastLearnedAt: 0,
    firstLearnedAt: 0,
  }
}

export function initWordStates(words: Array<{ word: string }>): Record<string, WordLearningState> {
  const states: Record<string, WordLearningState> = {}
  for (const w of words) {
    states[w.word] = defaultWordState(w.word)
  }
  return states
}

/** 从旧版 mastered / wrong 数据迁移 */
export function migrateWordStates(
  words: Array<{ id: string; word: string }>,
  states: Record<string, WordLearningState>,
  masteredIds: string[],
  wrongMap: Record<string, number>,
): Record<string, WordLearningState> {
  const next = { ...states }
  const idToWord = new Map(words.map((w) => [w.id, w.word]))

  for (const w of words) {
    if (!next[w.word]) next[w.word] = defaultWordState(w.word)
  }

  for (const id of masteredIds) {
    const wordKey = idToWord.get(id) ?? id.replace(/^xls-/, '')
    const w = words.find((x) => x.word === wordKey || x.id === id)
    if (!w) continue
    next[w.word] = {
      ...markMasteredState(next[w.word] ?? defaultWordState(w.word)),
      wordId: w.word,
    }
  }

  for (const [id, count] of Object.entries(wrongMap)) {
    if ((count ?? 0) <= 0) continue
    const wordKey = idToWord.get(id) ?? id.replace(/^xls-/, '')
    const w = words.find((x) => x.word === wordKey || x.id === id)
    if (!w) continue
    const base = next[w.word] ?? defaultWordState(w.word)
    next[w.word] = {
      ...base,
      wrongCount: Math.max(base.wrongCount, count),
      status: base.status === 'mastered' ? 'mastered' : 'learning',
      firstLearnedAt: base.firstLearnedAt || Date.now(),
    }
  }

  return next
}

export function meetsMasteredCriteria(state: WordLearningState): boolean {
  return (
    state.correctCount >= MASTER_CORRECT_THRESHOLD &&
    state.consecutiveCorrect >= MASTER_CONSECUTIVE_THRESHOLD
  )
}

export function applyCorrect(
  state: WordLearningState,
  currentRound: number,
): WordLearningState {
  if (state.status === 'mastered') return state

  const next: WordLearningState = {
    ...state,
    correctCount: state.correctCount + 1,
    consecutiveCorrect: state.consecutiveCorrect + 1,
    lastLearnedAt: Date.now(),
  }

  if (next.status === 'unlearned') {
    next.status = 'learning'
    next.firstLearnedAt = Date.now()
    next.learningRound = currentRound
  }

  if (meetsMasteredCriteria(next)) {
    next.status = 'mastered'
  }

  return next
}

export function applyWrong(
  state: WordLearningState,
  currentRound: number,
): WordLearningState {
  if (state.status === 'mastered') return state

  const next: WordLearningState = {
    ...state,
    wrongCount: state.wrongCount + 1,
    consecutiveCorrect: 0,
    lastLearnedAt: Date.now(),
  }

  if (next.status === 'unlearned') {
    next.status = 'learning'
    next.firstLearnedAt = Date.now()
    next.learningRound = currentRound
  }

  return next
}

export function markMasteredState(state: WordLearningState): WordLearningState {
  return {
    ...state,
    status: 'mastered',
    correctCount: Math.max(state.correctCount, MASTER_CORRECT_THRESHOLD),
    consecutiveCorrect: Math.max(state.consecutiveCorrect, MASTER_CONSECUTIVE_THRESHOLD),
    lastLearnedAt: Date.now(),
    firstLearnedAt: state.firstLearnedAt || Date.now(),
  }
}

export function getLearningQueue<T extends { word: string }>(
  words: T[],
  states: Record<string, WordLearningState>,
  currentRound: number,
): T[] {
  if (currentRound <= 1) {
    return words.filter((w) => (states[w.word]?.status ?? 'unlearned') !== 'mastered')
  }

  const learning = words.filter((w) => states[w.word]?.status === 'learning')
  return [...learning].sort((a, b) => {
    const sa = states[a.word] ?? defaultWordState(a.word)
    const sb = states[b.word] ?? defaultWordState(b.word)
    if (sb.wrongCount !== sa.wrongCount) return sb.wrongCount - sa.wrongCount
    return sa.firstLearnedAt - sb.firstLearnedAt
  })
}

export function computeLearningProgress(
  words: Array<{ word: string }>,
  states: Record<string, WordLearningState>,
  currentRound: number,
  queue: Array<{ word: string }>,
  learnIndex: number,
): LearningProgress {
  const totalWords = words.length
  const masteredWords = words.filter(
    (w) => states[w.word]?.status === 'mastered',
  ).length
  const roundProgress = Math.min(learnIndex, queue.length)

  return {
    currentRound,
    totalRounds: TOTAL_ROUNDS,
    roundProgress,
    totalWords,
    masteredWords,
    remainingWords: queue.length,
  }
}

export function countMasteredFromStates(
  words: Array<{ word: string }>,
  states: Record<string, WordLearningState>,
): number {
  return words.filter((w) => states[w.word]?.status === 'mastered').length
}

export function isAllMastered(
  words: Array<{ word: string }>,
  states: Record<string, WordLearningState>,
): boolean {
  return words.length > 0 && countMasteredFromStates(words, states) >= words.length
}

export function canAdvanceRound(
  currentRound: number,
  queueLength: number,
  learnIndex: number,
  masteredWords: number,
  totalWords: number,
): boolean {
  return (
    learnIndex >= queueLength &&
    queueLength > 0 &&
    masteredWords < totalWords &&
    currentRound < TOTAL_ROUNDS
  )
}

export function isLearningComplete(
  words: Array<{ word: string }>,
  states: Record<string, WordLearningState>,
  currentRound: number,
): boolean {
  if (isAllMastered(words, states)) return true
  return currentRound >= TOTAL_ROUNDS && getLearningQueue(words, states, currentRound).length === 0
}
