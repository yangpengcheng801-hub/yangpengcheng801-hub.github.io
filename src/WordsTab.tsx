import { useEffect, useMemo, useState } from 'react'
import MeaningHighlight from './MeaningHighlight'
import { speakWord } from './speech'

type Word = {
  id: string
  word: string
  meaning: string
  phonetic?: string
  pos: string
  examFreq?: number
  freqRank?: number
}

type Filter = 'all' | 'mastered' | 'wrong' | 'unlearned'
type SortMode = 'default' | 'freq'

const PAGE_SIZE = 80
const EMPTY_IDS = new Set<string>()

export default function WordsTab({
  words,
  masteredIds,
  wrongIds,
  loading = false,
  onSpeak,
  onAddWrong,
  onMarkMastered,
  onStartLearning,
}: {
  words: Word[]
  masteredIds?: Set<string>
  wrongIds?: Set<string>
  loading?: boolean
  onSpeak?: (word: string) => void
  onAddWrong?: (word: Word) => void
  onMarkMastered?: (word: Word) => void
  onStartLearning?: (word: Word) => void
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [sortMode, setSortMode] = useState<SortMode>('default')
  const [highOnly, setHighOnly] = useState(false)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const mastered = masteredIds ?? EMPTY_IDS
  const wrongSet = wrongIds ?? EMPTY_IDS

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = words.filter((w) => {
      const word = String(w?.word ?? '').trim()
      const meaning = String(w?.meaning ?? '')
      if (!word) return false
      if (q && !word.toLowerCase().includes(q) && !meaning.includes(q)) return false
      if (highOnly && !(typeof w.examFreq === 'number' && w.examFreq > 0)) return false
      const isMastered = mastered.has(w.id)
      const isWrong = wrongSet.has(w.id)
      if (filter === 'mastered') return isMastered
      if (filter === 'wrong') return isWrong
      if (filter === 'unlearned') return !isMastered
      return true
    })
    if (sortMode === 'freq') {
      return [...filtered].sort((a, b) => {
        const af = a.examFreq ?? 0
        const bf = b.examFreq ?? 0
        if (bf !== af) return bf - af
        return (a.freqRank ?? 99999) - (b.freqRank ?? 99999)
      })
    }
    return filtered
  }, [words, query, filter, masteredIds, wrongIds, highOnly, sortMode])

  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query, filter, highOnly, sortMode, words.length])

  const visibleList = useMemo(
    () => list.slice(0, visibleCount),
    [list, visibleCount],
  )

  const handleSpeak = (word: string) => {
    if (onSpeak) onSpeak(word)
    else speakWord(word)
  }

  if (loading) {
    return (
      <div className="app-card flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-slate-400">词库加载中…</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="app-card p-3">
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索单词或释义…"
          className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-400"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(
            [
              ['all', '全部'],
              ['mastered', '已掌握'],
              ['wrong', '错词'],
              ['unlearned', '未掌握'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium card-press ${
                filter === key
                  ? 'bg-indigo-500 text-white'
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setHighOnly((v) => !v)}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium card-press ${
              highOnly ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            只看高频
          </button>
          <button
            type="button"
            onClick={() => setSortMode((m) => (m === 'freq' ? 'default' : 'freq'))}
            className={`rounded-lg px-2.5 py-1 text-xs font-medium card-press ${
              sortMode === 'freq' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            按考频排序
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          共 {list.length} 个词
          {list.length > visibleList.length
            ? ` · 已显示 ${visibleList.length}`
            : ''}
          <span className="text-emerald-600"> · 绿色为四级常考义</span>
        </p>
      </div>

      <div className="max-h-[calc(100vh-280px)] space-y-2 overflow-y-auto pb-2">
        {visibleList.map((w, index) => {
          const isMastered = mastered.has(w.id)
          const isWrong = wrongSet.has(w.id)
          return (
            <div
              key={w.id || `${w.word}-${index}`}
              className="app-card flex items-start gap-3 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{w.word}</span>
                  {w.phonetic && (
                    <span className="text-xs text-slate-400">{w.phonetic}</span>
                  )}
                  {isMastered && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">
                      已掌握
                    </span>
                  )}
                  {isWrong && (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] text-orange-700">
                      错词
                    </span>
                  )}
                  {typeof w.examFreq === 'number' && w.examFreq > 0 && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] text-amber-700">
                      考频 {w.examFreq}
                    </span>
                  )}
                </div>
                <MeaningHighlight word={w} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {onStartLearning && (
                    <button
                      type="button"
                      onClick={() => onStartLearning(w)}
                      className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-medium text-indigo-700 card-press"
                    >
                      从这里学
                    </button>
                  )}
                  {onAddWrong && (
                    <button
                      type="button"
                      onClick={() => onAddWrong(w)}
                      className="rounded-lg bg-orange-50 px-2.5 py-1 text-[11px] font-medium text-orange-700 card-press"
                    >
                      加入错词
                    </button>
                  )}
                  {onMarkMastered && !isMastered && (
                    <button
                      type="button"
                      onClick={() => onMarkMastered(w)}
                      className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 card-press"
                    >
                      标记掌握
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label="发音"
                onClick={() => handleSpeak(w.word)}
                className="app-speak-btn shrink-0 card-press"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.06c1.48-.74 2.5-2.26 2.5-4.03z" />
                </svg>
              </button>
            </div>
          )
        })}
        {!list.length && (
          <div className="app-card p-8 text-center text-sm text-slate-400">没有匹配的单词</div>
        )}
        {list.length > visibleList.length && (
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="app-card w-full py-3 text-center text-sm font-medium text-indigo-600 card-press"
          >
            加载更多（还剩 {list.length - visibleList.length} 个）
          </button>
        )}
      </div>
    </div>
  )
}
