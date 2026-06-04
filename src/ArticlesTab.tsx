import { useCallback, useEffect, useMemo, useState } from 'react'
import articlePack from './articles/forty-articles.json'
import { pairArticleSentences } from './articleSentences'
import { loadDictionary, lookupWord, type DictEntry } from './dictionary'
import { lookupWordOnline } from './dictOnline'
import { cancelAutoSpeak, speakSentence, speakWord } from './speech'
import { assetPath } from './assetPath'

type Article = {
  id: number
  title: string
  en: string
  zh: string
}

type ArticlePack = {
  title: string
  subtitle: string
  count: number
  articles: Article[]
}

type DisplayMode = 'both' | 'en' | 'zh'

export default function ArticlesTab({ apiKey }: { apiKey: string }) {
  const pack = articlePack as ArticlePack
  const articles = Array.isArray(pack.articles) ? pack.articles : []
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [mode, setMode] = useState<DisplayMode>('both')
  const [dictMap, setDictMap] = useState<Map<string, { m: string; p?: string; o?: string }> | null>(
    null,
  )
  const [popup, setPopup] = useState<{
    word: string
    entry: DictEntry | null
    loading?: boolean
    error?: string
  } | null>(null)
  const [hfWords, setHfWords] = useState<Set<string>>(new Set())

  useEffect(() => {
    void loadDictionary().then(setDictMap)
  }, [])

  useEffect(() => {
    void fetch(assetPath('high-frequency-words.json'))
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return
        setHfWords(new Set(data.map((w) => String(w.word ?? '').toLowerCase()).filter(Boolean)))
      })
      .catch(() => {})
  }, [])

  const article = useMemo(
    () => articles.find((a) => a.id === selectedId) ?? null,
    [articles, selectedId],
  )

  useEffect(() => {
    return () => cancelAutoSpeak()
  }, [selectedId])

  const sentencePairs = useMemo(
    () => (article ? pairArticleSentences(article.en, article.zh) : []),
    [article],
  )

  const handleWordTap = useCallback(
    async (word: string) => {
      const w = word.trim()
      if (!w) return
      const local = dictMap ? lookupWord(w, dictMap) : null
      if (local) {
        setPopup({ word: w, entry: local })
        return
      }
      setPopup({ word: w, entry: null, loading: true })
      try {
        const online = await lookupWordOnline(w, apiKey || undefined)
        setPopup({
          word: w,
          entry: online,
          loading: false,
          error: online ? undefined : '未找到释义',
        })
      } catch {
        setPopup({ word: w, entry: null, loading: false, error: '查词失败' })
      }
    },
    [apiKey, dictMap],
  )

  const renderEnSentence = (text: string, key: string) => {
    const parts = text.split(/(\b[a-zA-Z]+(?:'[a-zA-Z]+)?\b)/g)
    return (
      <p key={key} className="article-en-p">
        {parts.map((part, i) => {
          if (!/^[a-zA-Z]/.test(part)) return <span key={i}>{part}</span>
          const isHigh = hfWords.has(part.toLowerCase())
          return (
            <button
              key={i}
              type="button"
              className={`article-word-tap ${isHigh ? 'article-word-tap--hf' : ''}`}
              onClick={() => void handleWordTap(part)}
            >
              {part}
            </button>
          )
        })}
      </p>
    )
  }

  if (!articles.length) {
    return (
      <div className="app-card flex min-h-[40vh] flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-orange-600">暂无文章数据</p>
        <p className="mt-2 text-xs text-stone-400">
          请确认已执行 npm run build:articles
        </p>
      </div>
    )
  }

  if (article) {
    return (
      <div className="space-y-3 pb-2">
        <button
          type="button"
          onClick={() => {
            cancelAutoSpeak()
            setSelectedId(null)
          }}
          className="text-sm font-medium text-indigo-600 card-press"
        >
          ← 返回目录
        </button>

        <div className="app-card p-4">
          <p className="text-xs text-stone-400">
            第 {article.id} 篇 · 共 {sentencePairs.length} 句
          </p>
          <h2 className="text-lg font-bold text-stone-900">{article.title}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ['both', '对照'],
                ['en', '英文'],
                ['zh', '中文'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`rounded-lg px-3 py-1 text-xs font-medium card-press ${
                  mode === key
                    ? 'bg-indigo-500 text-white'
                    : 'bg-stone-100 text-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => speakSentence(article.en)}
              className="rounded-lg bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 card-press"
            >
              朗读本篇
            </button>
            <button
              type="button"
              onClick={cancelAutoSpeak}
              className="rounded-lg bg-stone-100 px-3 py-1 text-xs font-medium text-stone-600 card-press"
            >
              停止朗读
            </button>
          </div>
        </div>

        <div className="article-reader space-y-3">
          {sentencePairs.map((pair) => (
            <div key={pair.index} className="article-sentence-pair app-card p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="article-sentence-no">#{pair.index}</span>
                {pair.en && (
                  <button
                    type="button"
                    onClick={() => speakSentence(pair.en)}
                    className="shrink-0 rounded-lg bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-600 card-press"
                    aria-label={`朗读第 ${pair.index} 句`}
                  >
                    朗读
                  </button>
                )}
              </div>
              {(mode === 'en' || mode === 'both') && pair.en && (
                renderEnSentence(pair.en, `en-${pair.index}`)
              )}
              {(mode === 'zh' || mode === 'both') && pair.zh && (
                <p
                  className={`article-zh-p ${mode === 'both' && pair.en ? 'mt-2 border-t border-stone-100 pt-2' : ''}`}
                >
                  {pair.zh}
                </p>
              )}
            </div>
          ))}
          <p className="px-1 text-[11px] text-stone-400">逐句对照 · 点击英文单词可查释义</p>
          <p className="px-1 text-[11px] text-amber-600">黄色标记为四级高频词</p>
        </div>

        {popup && (
          <div className="app-sheet app-sheet--dict" onClick={() => setPopup(null)}>
            <div className="app-sheet-panel" onClick={(e) => e.stopPropagation()}>
              <p className="text-xl font-bold text-indigo-600">{popup.word}</p>
              {popup.loading && (
                <p className="mt-3 text-sm text-stone-400 animate-pulse">查词中…</p>
              )}
              {!popup.loading && popup.entry && (
                <>
                  {popup.entry.phonetic && (
                    <p className="mt-1 text-sm text-stone-400">{popup.entry.phonetic}</p>
                  )}
                  <p className="mt-3 text-sm leading-relaxed text-stone-700">
                    {popup.entry.meaning}
                  </p>
                </>
              )}
              {!popup.loading && !popup.entry && (
                <p className="mt-3 text-sm text-orange-500">{popup.error ?? '未收录'}</p>
              )}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => speakWord(popup.word)}
                  className="flex-1 rounded-xl bg-violet-100 py-2 text-sm text-violet-700 card-press"
                >
                  发音
                </button>
                <button
                  type="button"
                  onClick={() => setPopup(null)}
                  className="flex-1 rounded-xl bg-indigo-500 py-2 text-sm text-white card-press"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3 pb-2">
      <div className="app-card p-4">
        <h2 className="text-lg font-bold text-stone-900">{pack.title}</h2>
        <p className="mt-1 text-sm text-stone-500">{pack.subtitle}</p>
        <p className="mt-2 text-xs text-indigo-600">共 {articles.length} 篇 · 逐句汉英对照</p>
      </div>

      <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pb-2">
        {articles.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => {
              setSelectedId(a.id)
              setMode('both')
            }}
            className="app-card w-full p-4 text-left card-press"
          >
            <span className="text-xs font-semibold text-indigo-500">#{a.id}</span>
            <p className="mt-0.5 font-semibold text-stone-800">{a.title}</p>
            {a.zh ? (
              <p className="mt-1 line-clamp-2 text-xs text-stone-500">
                {a.zh.length > 80 ? `${a.zh.slice(0, 80)}…` : a.zh}
              </p>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
