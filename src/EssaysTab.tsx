import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  isEssayFavorite,
  readEssayFavorites,
  toggleEssayFavorite,
} from './essayFavorites'
import {
  countWords,
  markExamRead,
  markMockRead,
  markTemplateDone,
  readEssayProgress,
  setDailyPractice,
  type EssayProgress,
} from './essayProgress'
import {
  clearEssayDraft,
  readEssayDraft,
  readTemplateFill,
  saveEssayDraft,
  saveTemplateFill,
} from './essayDrafts'
import { cancelAutoSpeak, speakSentence } from './speech'

type ParaBlock = { label: string; content: string }

type EssayTemplate = {
  id: string
  label: string
  icon: string
  desc: string
  steps: string
  practice: { topic: string; directions: string; outline: string }
  skeletonBlocks: ParaBlock[]
  fillInBlocks: ParaBlock[]
  sampleEssay: string
  sampleParagraphs: string[]
  wordCount?: number
}

type Pattern26 = {
  num: string
  title: string
  pattern: string
  examples: { en: string; zh: string }[]
}

type PhraseLibrary = {
  sentenceVariety: { title: string; examples: string[] }[]
  cetOpenings: { num: number; en: string }[]
  patterns26: Pattern26[]
  phraseSets: {
    sets: Record<string, { label: string; items: { en: string; zh: string }[] }>
    transitions: Record<string, string[]>
  }
  basicPatterns: {
    num: number
    category: string
    patterns: string[]
    example: string
  }[]
  chartPhrases: { en: string; zh: string }[]
}

type PastExam = {
  id: string
  year: number
  month: number
  level: 'cet4' | 'cet6'
  titleEn: string
  titleZh: string
  outline: string[]
  directions: string
  essay: string
  essayParagraphs: string[]
  wordCount?: number
  category?: string
  writingIdeas?: string[]
  keyExpressions?: string[]
}

type MockEssay = {
  id?: string
  label: string
  title: string
  body: string
  paragraphs: string[]
  wordCount?: number
}

type MockTest = {
  id: string
  num: number
  title: string
  topic: string
  directions: string
  outlineZh: string
  essays: MockEssay[]
  category?: string
  writingIdeas?: string[]
  keyExpressions?: string[]
}

type StudyPlanDay = { day: string; task: string }

type EssayPack = {
  title: string
  subtitle: string
  templates: EssayTemplate[]
  phraseLibrary: PhraseLibrary
  pastExams: PastExam[]
  recentCet4: PastExam[]
  mockTests: MockTest[]
  studyPlan: StudyPlanDay[]
  stats: Record<string, number>
}

type Screen =
  | 'home'
  | 'templates'
  | 'template'
  | 'phrases'
  | 'phrase-detail'
  | 'exams'
  | 'exam'
  | 'mocks'
  | 'mock'
  | 'favorites'

type TemplateTab = 'steps' | 'skeleton' | 'fill' | 'sample'
type PhraseSection = 'patterns26' | 'sets' | 'openings' | 'variety' | 'basic' | 'chart'
type LevelFilter = 'all' | 'cet4' | 'cet6'

function StarButton({
  id,
  favorites,
  onToggle,
}: {
  id: string
  favorites: string[]
  onToggle: (id: string) => void
}) {
  const on = favorites.includes(id)
  return (
    <button
      type="button"
      onClick={() => onToggle(id)}
      className={`text-lg card-press ${on ? 'text-amber-500' : 'text-stone-300'}`}
      aria-label={on ? '取消收藏' : '收藏'}
    >
      {on ? '★' : '☆'}
    </button>
  )
}

function BackBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className="text-sm font-medium text-teal-600 card-press">
      ← {label}
    </button>
  )
}

function TextBlock({ text, className = '' }: { text: string; className?: string }) {
  if (!text?.trim()) return <p className="text-sm text-stone-400">暂无内容</p>
  return (
    <div className={`essay-text-block whitespace-pre-wrap text-sm leading-relaxed ${className}`}>
      {text}
    </div>
  )
}

function ParaCards({ blocks }: { blocks: ParaBlock[] }) {
  if (!blocks.length) return <TextBlock text="" />
  return (
    <div className="space-y-3">
      {blocks.map((b, i) => (
        <div key={i} className="rounded-xl border border-teal-100 bg-teal-50/40 p-3">
          <p className="mb-2 text-xs font-bold text-teal-700">{b.label}</p>
          <TextBlock text={b.content} className="text-stone-800" />
        </div>
      ))}
    </div>
  )
}

function OutlineList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="mt-2 space-y-1">
      {items.map((line, i) => (
        <li key={i} className="flex gap-2 text-sm text-stone-700">
          <span className="shrink-0 font-semibold text-teal-600">{i + 1}.</span>
          <span>{line.replace(/^[\d1-9、．.)]+\s*/, '')}</span>
        </li>
      ))}
    </ul>
  )
}

function DraftEditor({
  id,
  title = '我的作文草稿',
  referenceText,
  onSaved,
}: {
  id: string
  title?: string
  referenceText?: string
  onSaved?: () => void
}) {
  const [text, setText] = useState(() => readEssayDraft(id))
  const [savedAt, setSavedAt] = useState('')
  const words = countWords(text)
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 0).length
  const ready = words >= 120 && paragraphs >= 3

  useEffect(() => {
    setText(readEssayDraft(id))
    setSavedAt('')
  }, [id])

  const handleSave = () => {
    saveEssayDraft(id, text)
    setSavedAt(new Date().toLocaleTimeString())
    onSaved?.()
  }

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className={`mt-1 text-[11px] ${ready ? 'text-teal-600' : 'text-stone-400'}`}>
            {words} 词 · {paragraphs || 0} 段 · 四级建议 120-180 词、3 段结构
          </p>
        </div>
        {savedAt && <span className="text-[10px] text-teal-600">已保存 {savedAt}</span>}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="在这里写你的作文。建议：第一段点题，第二段论证，第三段总结。"
        className="min-h-[180px] w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-teal-400"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleSave}
          className="rounded-xl bg-teal-500 px-4 py-2 text-sm font-medium text-white card-press"
        >
          保存草稿
        </button>
        <button
          type="button"
          onClick={() => {
            clearEssayDraft(id)
            setText('')
            setSavedAt('')
          }}
          className="rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-600 card-press"
        >
          清空
        </button>
        {referenceText && (
          <button
            type="button"
            onClick={() => {
              const next = text.trim()
                ? `${text.trim()}\n\n--- 参考表达 ---\n${referenceText}`
                : referenceText
              setText(next)
            }}
            className="rounded-xl bg-violet-50 px-4 py-2 text-sm text-violet-700 card-press"
          >
            插入参考表达
          </button>
        )}
      </div>
      {!ready && text.trim() && (
        <p className="mt-2 text-xs text-amber-600">
          还可以继续补足词数或分段，考场作文尽量写满 3 段。
        </p>
      )}
    </div>
  )
}

function TemplateFillPractice({ template }: { template: EssayTemplate }) {
  const blanks = useMemo(() => {
    const text = template.skeletonBlocks.map((b) => b.content).join('\n')
    return Array.from({ length: Math.max(3, Math.min(12, (text.match(/_{3,}/g) ?? []).length)) })
  }, [template])
  const [values, setValues] = useState<string[]>(() => readTemplateFill(template.id))

  useEffect(() => {
    setValues(readTemplateFill(template.id))
  }, [template.id])

  const update = (index: number, value: string) => {
    const next = [...values]
    next[index] = value
    setValues(next)
    saveTemplateFill(template.id, next)
  }

  const generated = useMemo(() => {
    let i = 0
    return template.skeletonBlocks
      .map((b) => {
        const content = b.content.replace(/_{3,}/g, () => values[i++]?.trim() || '_____')
        return content
      })
      .join('\n\n')
  }, [template.skeletonBlocks, values])

  return (
    <div className="space-y-3">
      <div className="app-card p-4">
        <p className="mb-3 text-xs font-semibold text-teal-700">填空练习</p>
        <div className="space-y-2">
          {blanks.map((_, i) => (
            <input
              key={i}
              value={values[i] ?? ''}
              onChange={(e) => update(i, e.target.value)}
              placeholder={`空位 ${i + 1}`}
              className="w-full rounded-xl border border-stone-200 px-3 py-2 text-sm outline-none focus:border-teal-400"
            />
          ))}
        </div>
      </div>
      <div className="app-card p-4">
        <p className="mb-2 text-xs font-semibold text-stone-500">生成预览</p>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-stone-800">
          {generated}
        </pre>
      </div>
    </div>
  )
}

export default function EssaysTab() {
  const [pack, setPack] = useState<EssayPack | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [screen, setScreen] = useState<Screen>('home')
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [templateTab, setTemplateTab] = useState<TemplateTab>('steps')
  const [phraseSection, setPhraseSection] = useState<PhraseSection>('patterns26')
  const [phraseSetKey, setPhraseSetKey] = useState<string>('opening')
  const [examId, setExamId] = useState<string | null>(null)
  const [mockId, setMockId] = useState<string | null>(null)
  const [mockEssayIdx, setMockEssayIdx] = useState(0)
  const [levelFilter, setLevelFilter] = useState<LevelFilter>('all')
  const [favorites, setFavorites] = useState<string[]>(() => readEssayFavorites())
  const [expandedPattern, setExpandedPattern] = useState<number | null>(0)
  const [examSearch, setExamSearch] = useState('')
  const [practiceMode, setPracticeMode] = useState(false)
  const [progress, setProgress] = useState<EssayProgress>(() => readEssayProgress())
  const [copyTip, setCopyTip] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetch('/essay-materials.json')
      .then((r) => {
        if (!r.ok) throw new Error('作文素材加载失败')
        return r.json() as Promise<EssayPack>
      })
      .then((data) => {
        if (!cancelled) {
          setPack(data)
          setError('')
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => cancelAutoSpeak()
  }, [screen, templateId, examId, mockId, mockEssayIdx])

  const toggleFav = useCallback((id: string) => {
    setFavorites(toggleEssayFavorite(id))
  }, [])

  const template = useMemo(
    () => pack?.templates.find((t) => t.id === templateId) ?? null,
    [pack, templateId],
  )
  const exam = useMemo(() => pack?.pastExams.find((e) => e.id === examId) ?? null, [pack, examId])
  const mock = useMemo(() => pack?.mockTests.find((m) => m.id === mockId) ?? null, [pack, mockId])

  const filteredExams = useMemo(() => {
    if (!pack) return []
    let list = levelFilter === 'all' ? pack.pastExams : pack.pastExams.filter((e) => e.level === levelFilter)
    const q = examSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (e) =>
          e.titleEn.toLowerCase().includes(q) ||
          e.titleZh.includes(q) ||
          String(e.year).includes(q),
      )
    }
    return list
  }, [pack, levelFilter, examSearch])

  const dailyExam = useMemo(() => {
    if (!pack?.pastExams.length) return null
    const cet4 = pack.pastExams.filter((e) => e.level === 'cet4')
    const pool = cet4.length ? cet4 : pack.pastExams
    const today = new Date().toISOString().slice(0, 10)
    if (progress.lastDailyId && progress.lastDailyAt === today) {
      return pool.find((e) => e.id === progress.lastDailyId) ?? pool[0]
    }
    const idx = Math.floor(Math.random() * pool.length)
    return pool[idx]
  }, [pack, progress.lastDailyId, progress.lastDailyAt])

  const copyText = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyTip('已复制')
      setTimeout(() => setCopyTip(''), 1500)
    } catch {
      setCopyTip('复制失败')
    }
  }, [])

  const phraseSetKeys = useMemo(
    () => Object.keys(pack?.phraseLibrary.phraseSets.sets ?? {}),
    [pack],
  )

  const favoriteItems = useMemo(() => {
    if (!pack) return []
    const items: { id: string; kind: string; title: string; sub: string; go: () => void }[] = []
    for (const t of pack.templates) {
      if (isEssayFavorite(`tpl-${t.id}`, favorites)) {
        items.push({
          id: `tpl-${t.id}`,
          kind: '模板',
          title: t.label,
          sub: t.desc,
          go: () => {
            setTemplateId(t.id)
            setTemplateTab('skeleton')
            setScreen('template')
          },
        })
      }
    }
    for (const e of pack.pastExams) {
      if (isEssayFavorite(`exam-${e.id}`, favorites)) {
        items.push({
          id: `exam-${e.id}`,
          kind: e.level === 'cet6' ? '六级' : '四级',
          title: e.titleZh || e.titleEn,
          sub: `${e.year}年${e.month}月`,
          go: () => {
            setExamId(e.id)
            setScreen('exam')
          },
        })
      }
    }
    for (const m of pack.mockTests) {
      if (isEssayFavorite(`mock-${m.id}`, favorites)) {
        items.push({
          id: `mock-${m.id}`,
          kind: '预测',
          title: m.topic,
          sub: m.title,
          go: () => {
            setMockId(m.id)
            setMockEssayIdx(0)
            setScreen('mock')
          },
        })
      }
    }
    return items
  }, [pack, favorites])

  const goHome = () => {
    setScreen('home')
    setTemplateId(null)
    setExamId(null)
    setMockId(null)
  }

  if (loading) {
    return (
      <div className="app-card flex min-h-[40vh] items-center justify-center p-8">
        <p className="text-sm text-stone-400">作文素材加载中…</p>
      </div>
    )
  }

  if (error || !pack) {
    return (
      <div className="app-card flex min-h-[40vh] flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-orange-600">{error || '暂无作文数据'}</p>
        <p className="mt-2 text-xs text-stone-400">请执行 npm run build:essays</p>
      </div>
    )
  }

  if (screen === 'template' && template) {
    const tabs: { key: TemplateTab; label: string; hint: string }[] = [
      { key: 'steps', label: '① 写法', hint: '看清分段逻辑' },
      { key: 'skeleton', label: '② 框架', hint: '背空位模板' },
      { key: 'fill', label: '③ 填空', hint: '对照范例填' },
      { key: 'sample', label: '④ 范文', hint: '熟读全文' },
    ]
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={() => setScreen('templates')} label="题型模板" />
        <div className="app-card p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-2xl">{template.icon}</span>
              <h2 className="mt-1 text-lg font-bold text-stone-900">{template.label}</h2>
              <p className="text-xs text-stone-500">{template.desc}</p>
            </div>
            <StarButton id={`tpl-${template.id}`} favorites={favorites} onToggle={toggleFav} />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTemplateTab(key)}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium card-press ${
                  templateTab === key ? 'bg-teal-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-teal-600">
            {tabs.find((t) => t.key === templateTab)?.hint}
          </p>
        </div>

        {templateTab === 'steps' && (
          <>
            <div className="app-card p-4">
              <p className="mb-2 text-xs font-semibold text-stone-500">写作步骤</p>
              <TextBlock text={template.steps} />
            </div>
            <div className="app-card border border-amber-100 bg-amber-50/50 p-4">
              <p className="mb-1 text-xs font-semibold text-amber-700">实战题目 · {template.practice.topic}</p>
              <TextBlock text={template.practice.outline || template.practice.directions} />
            </div>
          </>
        )}
        {templateTab === 'skeleton' && (
          <div className="app-card p-4">
            <p className="mb-3 text-xs text-stone-500">把 _____ 换成与你题目相关的内容</p>
            <ParaCards blocks={template.skeletonBlocks} />
          </div>
        )}
        {templateTab === 'fill' && (
          <>
            <TemplateFillPractice template={template} />
            <div className="app-card p-4">
              <p className="mb-3 text-xs text-stone-500">参考填充范例</p>
              <ParaCards blocks={template.fillInBlocks} />
            </div>
          </>
        )}
        {templateTab === 'sample' && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speakSentence(template.sampleEssay)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-violet-600 card-press"
              >
                🔊 朗读
              </button>
              <button
                type="button"
                onClick={cancelAutoSpeak}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                停止朗读
              </button>
              <button
                type="button"
                onClick={() => void copyText(template.sampleEssay)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                复制范文
              </button>
              <button
                type="button"
                onClick={() => setProgress(markTemplateDone(template.id))}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-teal-600 card-press"
              >
                {progress.templatesDone.includes(template.id) ? '已学完 ✓' : '标记学完'}
              </button>
            </div>
            {template.wordCount && (
              <p className="text-center text-xs text-stone-400">约 {template.wordCount} 词（四级需 ≥120）</p>
            )}
            <div className="app-card space-y-3 p-4">
              {(template.sampleParagraphs.length ? template.sampleParagraphs : [template.sampleEssay]).map(
                (p, i) => (
                  <div key={i} className="rounded-lg bg-stone-50 p-3">
                    <span className="text-[10px] font-bold text-teal-600">段 {i + 1}</span>
                    <p className="mt-1 text-sm leading-relaxed text-stone-800">{p}</p>
                  </div>
                ),
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  if (screen === 'templates') {
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={goHome} label="作文速成" />
        <p className="px-1 text-xs leading-relaxed text-stone-500">
          四级最常考三类：先背框架空位，考场上 10 分钟套写，再用句型润色。
        </p>
        {pack.templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTemplateId(t.id)
              setTemplateTab('skeleton')
              setScreen('template')
            }}
            className="app-card w-full p-4 text-left card-press"
          >
            <div className="flex justify-between">
              <span className="text-2xl">{t.icon}</span>
              <StarButton id={`tpl-${t.id}`} favorites={favorites} onToggle={toggleFav} />
            </div>
            <p className="mt-2 font-semibold text-stone-800">{t.label}</p>
            <p className="mt-1 text-xs text-stone-500">{t.desc}</p>
            <p className="mt-2 text-[11px] text-teal-600">
              {t.skeletonBlocks.length} 段框架 · 范例 {t.practice.topic}
            </p>
          </button>
        ))}
      </div>
    )
  }

  if (screen === 'phrases') {
    const lib = pack.phraseLibrary
    const sections: { key: PhraseSection; label: string; count: number }[] = [
      { key: 'patterns26', label: '26 高级句式', count: lib.patterns26.length },
      { key: 'sets', label: '套句库（开头/结尾/论证）', count: phraseSetKeys.length },
      { key: 'basic', label: '12 类基本句式', count: lib.basicPatterns.length },
      { key: 'chart', label: '图表作文句型', count: lib.chartPhrases?.length ?? 0 },
      { key: 'openings', label: '小作文开头 11 式', count: lib.cetOpenings.length },
      { key: 'variety', label: '句子开头多变', count: lib.sentenceVariety.length },
    ]

    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={goHome} label="作文速成" />
        <div className="app-card p-4">
          <h2 className="font-bold text-stone-900">万能句型库</h2>
          <p className="mt-1 text-xs text-stone-500">每类挑 3～5 条背熟，写作时替换首句和论证句</p>
        </div>
        {sections.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setPhraseSection(s.key)
              setExpandedPattern(0)
              setScreen('phrase-detail')
            }}
            className="app-card flex w-full items-center justify-between p-4 text-left card-press"
          >
            <span className="font-medium text-stone-800">{s.label}</span>
            <span className="text-sm text-teal-600">{s.count} ›</span>
          </button>
        ))}
      </div>
    )
  }

  if (screen === 'phrase-detail') {
    const lib = pack.phraseLibrary
    const titles: Record<PhraseSection, string> = {
      patterns26: '26 高级句式',
      sets: '套句库',
      openings: '小作文开头',
      variety: '句子多变',
      basic: '基本句式',
      chart: '图表作文',
    }

    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={() => setScreen('phrases')} label="句型库" />
        <div className="app-card p-4">
          <h2 className="font-bold text-stone-900">{titles[phraseSection]}</h2>
        </div>

        {phraseSection === 'patterns26' && (
          <div className="space-y-2">
            {lib.patterns26.map((p, i) => (
              <div key={i} className="app-card overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedPattern(expandedPattern === i ? null : i)}
                  className="flex w-full items-center justify-between p-4 text-left card-press"
                >
                  <span className="text-sm font-semibold text-stone-800">
                    {p.num}、{p.title}
                  </span>
                  <span className="text-stone-400">{expandedPattern === i ? '▲' : '▼'}</span>
                </button>
                {expandedPattern === i && (
                  <div className="border-t border-stone-100 px-4 pb-4">
                    <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-indigo-800">
                      {p.pattern}
                    </pre>
                    {p.examples.map((ex, j) => (
                      <div key={j} className="mt-3 rounded-lg bg-stone-50 p-3">
                        <p className="text-sm text-stone-800">{ex.en}</p>
                        {ex.zh && <p className="mt-1 text-xs text-stone-500">{ex.zh}</p>}
                        {ex.en && (
                          <button
                            type="button"
                            onClick={() => speakSentence(ex.en)}
                            className="mt-2 text-xs text-violet-600 card-press"
                          >
                            朗读
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {phraseSection === 'sets' && (
          <>
            <div className="flex flex-wrap gap-2">
              {phraseSetKeys.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPhraseSetKey(k)}
                  className={`rounded-lg px-3 py-1 text-xs font-medium card-press ${
                    phraseSetKey === k ? 'bg-teal-500 text-white' : 'bg-stone-100'
                  }`}
                >
                  {lib.phraseSets.sets[k]?.label}
                </button>
              ))}
            </div>
            <div className="space-y-2">
              {lib.phraseSets.sets[phraseSetKey]?.items.map((item, i) => (
                <div key={i} className="app-card p-4">
                  <p className="text-sm font-medium text-stone-800">{item.en}</p>
                  {item.zh && <p className="mt-1 text-xs text-stone-500">{item.zh}</p>}
                </div>
              ))}
            </div>
            {Object.keys(lib.phraseSets.transitions).length > 0 && (
              <div className="app-card p-4">
                <p className="mb-2 text-xs font-semibold text-stone-500">过渡词</p>
                {Object.entries(lib.phraseSets.transitions).map(([k, words]) => (
                  <div key={k} className="mb-3">
                    <p className="text-xs font-bold text-teal-700">{k}</p>
                    <p className="mt-1 text-xs text-stone-600">{words.join(', ')}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {phraseSection === 'basic' &&
          lib.basicPatterns.map((g) => (
            <div key={g.num} className="app-card p-4">
              <p className="font-semibold text-teal-700">
                {g.num}. {g.category}
              </p>
              <ul className="mt-2 space-y-1">
                {g.patterns.map((p, i) => (
                  <li key={i} className="text-sm text-stone-700">
                    · {p}
                  </li>
                ))}
              </ul>
              {g.example && (
                <div className="mt-3 rounded-lg bg-stone-50 p-3">
                  <p className="text-[10px] font-semibold text-stone-400">示例</p>
                  <p className="mt-1 text-xs leading-relaxed text-stone-700">{g.example}</p>
                </div>
              )}
            </div>
          ))}

        {phraseSection === 'openings' &&
          lib.cetOpenings.map((o) => (
            <div key={o.num} className="app-card p-4">
              <span className="text-xs font-bold text-teal-600">({o.num})</span>
              <p className="mt-1 text-sm text-stone-800">{o.en}</p>
              <button
                type="button"
                onClick={() => speakSentence(o.en)}
                className="mt-2 text-xs text-violet-600 card-press"
              >
                朗读
              </button>
            </div>
          ))}

        {phraseSection === 'chart' &&
          (lib.chartPhrases ?? []).map((item, i) => (
            <div key={i} className="app-card p-4">
              <p className="text-sm font-medium text-stone-800">{item.en}</p>
              {item.zh && <p className="mt-1 text-xs text-stone-500">{item.zh}</p>}
            </div>
          ))}

        {phraseSection === 'variety' &&
          lib.sentenceVariety.map((v, i) => (
            <div key={i} className="app-card p-4">
              <p className="text-sm font-semibold text-stone-800">{v.title}</p>
              <ul className="mt-2 space-y-2">
                {v.examples.map((ex, j) => (
                  <li key={j} className="text-sm text-stone-700">
                    {ex}
                  </li>
                ))}
              </ul>
            </div>
          ))}
      </div>
    )
  }

  if (screen === 'exam' && exam) {
    const wc = exam.wordCount ?? countWords(exam.essay)
    const read = progress.examsRead.includes(exam.id)
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={() => setScreen('exams')} label="历年真题" />
        <div className="app-card p-4">
          <div className="flex justify-between gap-2">
            <div>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                {exam.level === 'cet6' ? '六级' : '四级'} · {exam.year}年{exam.month}月
              </span>
              <h2 className="mt-2 text-lg font-bold text-stone-900">
                {exam.titleZh || exam.titleEn}
              </h2>
              {exam.titleZh && exam.titleEn && (
                <p className="mt-1 text-sm text-stone-500">{exam.titleEn}</p>
              )}
            </div>
            <StarButton id={`exam-${exam.id}`} favorites={favorites} onToggle={toggleFav} />
          </div>
          {exam.outline.length > 0 && (
            <div className="mt-3 rounded-xl bg-amber-50/60 p-3">
              <p className="text-xs font-semibold text-amber-700">中文提纲（先据此自拟再对照范文）</p>
              <OutlineList items={exam.outline} />
            </div>
          )}
          {(exam.category || exam.writingIdeas?.length || exam.keyExpressions?.length) && (
            <div className="mt-3 space-y-2 rounded-xl bg-teal-50/70 p-3">
              {exam.category && (
                <p className="text-xs font-semibold text-teal-700">题型：{exam.category}</p>
              )}
              {exam.writingIdeas?.length ? (
                <div>
                  <p className="text-xs font-semibold text-teal-700">写作思路</p>
                  <OutlineList items={exam.writingIdeas} />
                </div>
              ) : null}
              {exam.keyExpressions?.length ? (
                <p className="text-xs leading-relaxed text-teal-800">
                  高频表达：{exam.keyExpressions.join(' · ')}
                </p>
              ) : null}
            </div>
          )}
          <p className="mt-2 text-xs text-stone-400">
            约 {wc} 词 {read ? '· 已读 ✓' : ''}
          </p>
        </div>
        <DraftEditor
          id={`exam-${exam.id}`}
          referenceText={(exam.keyExpressions ?? []).slice(0, 6).join('; ')}
          onSaved={() => setProgress(markExamRead(exam.id))}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPracticeMode((v) => !v)}
            className={`flex-1 rounded-xl py-2 text-sm font-medium card-press ${
              practiceMode ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-700'
            }`}
          >
            {practiceMode ? '显示范文' : '仿写模式（隐藏范文）'}
          </button>
          <button
            type="button"
            onClick={() => {
              setProgress(markExamRead(exam.id))
            }}
            className="rounded-xl bg-stone-100 px-3 py-2 text-sm text-stone-600 card-press"
          >
            标记已练
          </button>
        </div>
        {!practiceMode && (
          <>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speakSentence(exam.essay)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-violet-600 card-press"
              >
                🔊 朗读
              </button>
              <button
                type="button"
                onClick={cancelAutoSpeak}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                停止朗读
              </button>
              <button
                type="button"
                onClick={() => void copyText(exam.essay)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                复制全文
              </button>
            </div>
            {copyTip && <p className="text-center text-xs text-teal-600">{copyTip}</p>}
            <div className="app-card space-y-3 p-4">
              <p className="text-xs font-semibold text-teal-700">参考范文（按段）</p>
              {exam.essayParagraphs.map((p, i) => (
                <div key={i} className="rounded-lg bg-stone-50 p-3">
                  <span className="text-[10px] font-bold text-stone-400">¶{i + 1}</span>
                  <p className="mt-1 text-sm leading-relaxed text-stone-800">{p}</p>
                </div>
              ))}
            </div>
          </>
        )}
        {practiceMode && (
          <div className="app-card border border-dashed border-teal-200 p-4 text-sm text-teal-700">
            <p className="font-semibold">仿写提示</p>
            <p className="mt-1">根据提纲写一篇 ≥120 词作文，写完再点「显示范文」对照。</p>
          </div>
        )}
      </div>
    )
  }

  if (screen === 'exams') {
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={goHome} label="作文速成" />
        <p className="px-1 text-xs text-stone-500">
          先看提纲理解审题，再逐段对照范文，模仿结构和衔接词。
        </p>
        <input
          type="search"
          value={examSearch}
          onChange={(e) => setExamSearch(e.target.value)}
          placeholder="搜索年份或题目…"
          className="app-card w-full px-4 py-2.5 text-sm outline-none"
        />
        <div className="flex gap-2">
          {(['all', 'cet4', 'cet6'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setLevelFilter(f)}
              className={`rounded-lg px-3 py-1 text-xs font-medium card-press ${
                levelFilter === f ? 'bg-teal-500 text-white' : 'bg-stone-100 text-stone-600'
              }`}
            >
              {f === 'all' ? `全部 ${pack.pastExams.length}` : f === 'cet4' ? '四级' : '六级'}
            </button>
          ))}
        </div>
        <div className="max-h-[calc(100vh-260px)] space-y-2 overflow-y-auto">
          {filteredExams.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                setExamId(e.id)
                setScreen('exam')
              }}
              className="app-card w-full p-3 text-left card-press"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold text-teal-600">
                    {e.year}.{e.month} · {e.level === 'cet6' ? '六级' : '四级'}
                  </span>
                  <p className="mt-0.5 truncate font-medium text-stone-800">
                    {e.titleZh || e.titleEn}
                  </p>
                  {progress.examsRead.includes(e.id) && (
                    <span className="text-[10px] text-teal-500">已练</span>
                  )}
                </div>
                <StarButton id={`exam-${e.id}`} favorites={favorites} onToggle={toggleFav} />
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (screen === 'mock' && mock) {
    const essay = mock.essays[mockEssayIdx] ?? mock.essays[0]
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={() => setScreen('mocks')} label="预测模拟" />
        <div className="app-card p-4">
          <div className="flex justify-between">
            <div>
              <p className="text-xs text-stone-400">{mock.title}</p>
              <h2 className="font-bold text-stone-900">{mock.topic}</h2>
            </div>
            <StarButton id={`mock-${mock.id}`} favorites={favorites} onToggle={toggleFav} />
          </div>
          {mock.outlineZh && (
            <div className="mt-3 rounded-xl bg-stone-50 p-3">
              <p className="text-xs font-semibold text-stone-500">中文提纲</p>
              <TextBlock text={mock.outlineZh} className="text-sm" />
            </div>
          )}
          {(mock.category || mock.writingIdeas?.length || mock.keyExpressions?.length) && (
            <div className="mt-3 space-y-2 rounded-xl bg-teal-50/70 p-3">
              {mock.category && (
                <p className="text-xs font-semibold text-teal-700">题型：{mock.category}</p>
              )}
              {mock.writingIdeas?.length ? (
                <div>
                  <p className="text-xs font-semibold text-teal-700">写作思路</p>
                  <OutlineList items={mock.writingIdeas} />
                </div>
              ) : null}
              {mock.keyExpressions?.length ? (
                <p className="text-xs leading-relaxed text-teal-800">
                  高频表达：{mock.keyExpressions.join(' · ')}
                </p>
              ) : null}
            </div>
          )}
          <div className="mt-3">
            <p className="text-xs font-semibold text-stone-500">Directions</p>
            <TextBlock text={mock.directions} className="text-sm text-stone-700" />
          </div>
        </div>
        {mock.essays.length > 1 && (
          <div className="flex gap-2">
            {mock.essays.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setMockEssayIdx(i)}
                className={`flex-1 rounded-lg py-2 text-xs font-medium card-press ${
                  mockEssayIdx === i ? 'bg-teal-500 text-white' : 'bg-stone-100'
                }`}
              >
                {e.label}
              </button>
            ))}
          </div>
        )}
        {essay && (
          <>
            <p className="text-center text-xs text-stone-400">
              约 {essay.wordCount ?? countWords(essay.body)} 词
            </p>
            <DraftEditor
              id={`mock-${mock.id}-${essay.id ?? mockEssayIdx}`}
              referenceText={(mock.keyExpressions ?? []).slice(0, 6).join('; ')}
              onSaved={() => setProgress(markMockRead(mock.id))}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => speakSentence(essay.body)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-violet-600 card-press"
              >
                🔊 朗读
              </button>
              <button
                type="button"
                onClick={cancelAutoSpeak}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                停止朗读
              </button>
              <button
                type="button"
                onClick={() => void copyText(essay.body)}
                className="app-card flex-1 py-2 text-center text-sm font-medium text-stone-600 card-press"
              >
                复制
              </button>
            </div>
            <div className="app-card space-y-3 p-4">
              <p className="text-xs font-semibold text-teal-700">{essay.title}</p>
              {essay.paragraphs.map((p, i) => (
                <div key={i} className="rounded-lg bg-stone-50 p-3">
                  <p className="text-sm leading-relaxed text-stone-800">{p}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  if (screen === 'mocks') {
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={goHome} label="作文速成" />
        <p className="px-1 text-xs text-stone-500">模拟卷含两套题时可在详情页切换「主题一 / 主题二」</p>
        {pack.mockTests.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMockId(m.id)
              setMockEssayIdx(0)
              setProgress(markMockRead(m.id))
              setScreen('mock')
            }}
            className="app-card w-full p-4 text-left card-press"
          >
            <div className="flex justify-between">
              <p className="font-semibold text-stone-800">{m.title}</p>
              <StarButton id={`mock-${m.id}`} favorites={favorites} onToggle={toggleFav} />
            </div>
            <p className="mt-1 text-sm text-teal-800">{m.topic}</p>
            <p className="mt-1 text-[11px] text-stone-400">
              {m.essays.length} 篇范文
              {progress.mocksRead.includes(m.id) ? ' · 已练' : ''}
            </p>
          </button>
        ))}
      </div>
    )
  }

  if (screen === 'favorites') {
    return (
      <div className="space-y-3 pb-2">
        <BackBtn onClick={goHome} label="作文速成" />
        {favoriteItems.length === 0 ? (
          <div className="app-card p-8 text-center text-sm text-stone-400">
            还没有收藏。在模板、真题、预测页点击 ☆ 加入复习列表。
          </div>
        ) : (
          favoriteItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.go}
              className="app-card w-full p-4 text-left card-press"
            >
              <span className="text-[10px] font-semibold text-amber-600">{item.kind}</span>
              <p className="font-medium text-stone-800">{item.title}</p>
              <p className="text-xs text-stone-500">{item.sub}</p>
            </button>
          ))
        )}
      </div>
    )
  }

  const pathSteps = [
    {
      step: 1,
      title: '背题型模板',
      desc: `${pack.stats.templates} 种 · 框架→填空→范文`,
      color: 'bg-teal-500',
      action: () => setScreen('templates'),
    },
    {
      step: 2,
      title: '背万能句型',
      desc: `26句式 + 套句 + 基本句式`,
      color: 'bg-violet-500',
      action: () => setScreen('phrases'),
    },
    {
      step: 3,
      title: '刷历年真题',
      desc: `${pack.stats.pastExams} 套 · 提纲+分段范文`,
      color: 'bg-indigo-500',
      action: () => setScreen('exams'),
    },
    {
      step: 4,
      title: '练预测模拟',
      desc: `${pack.stats.mockTests} 套 Model Test`,
      color: 'bg-amber-500',
      action: () => setScreen('mocks'),
    },
  ]

  return (
    <div className="space-y-3 pb-2">
      <div className="app-card p-4">
        <h2 className="text-lg font-bold text-stone-900">{pack.title}</h2>
        <p className="mt-1 text-sm text-stone-500">内容来自三份 Word 原版素材，按考试逻辑重组</p>
        <div className="mt-3 space-y-2 rounded-xl bg-teal-50 px-3 py-2.5 text-xs text-teal-900">
          <p className="font-semibold">7 天速成计划</p>
          {(pack.studyPlan ?? []).map((s) => (
            <p key={s.day} className="text-teal-800">
              <span className="font-medium">第{s.day}天</span> {s.task}
            </p>
          ))}
        </div>
        <div className="mt-3 flex gap-3 text-xs text-stone-500">
          <span>模板 {progress.templatesDone.length}/{pack.templates.length}</span>
          <span>真题 {progress.examsRead.length}/{pack.pastExams.length}</span>
          <span>预测 {progress.mocksRead.length}/{pack.mockTests.length}</span>
        </div>
      </div>

      {dailyExam && (
        <button
          type="button"
          onClick={() => {
            setExamId(dailyExam.id)
            setPracticeMode(true)
            setProgress(setDailyPractice(dailyExam.id))
            setScreen('exam')
          }}
          className="app-card w-full border border-teal-200 bg-gradient-to-r from-teal-50 to-indigo-50 p-4 text-left card-press"
        >
          <p className="text-xs font-semibold text-teal-600">今日一练 · 仿写模式</p>
          <p className="mt-1 font-semibold text-stone-800">{dailyExam.titleZh || dailyExam.titleEn}</p>
          <p className="mt-1 text-xs text-stone-500">
            {dailyExam.year}年{dailyExam.month}月 · 先看提纲再写
          </p>
        </button>
      )}

      {(pack.recentCet4?.length ?? 0) > 0 && (
        <div className="app-card p-4">
          <p className="mb-2 text-xs font-semibold text-stone-500">近年四级真题速览</p>
          <div className="flex flex-wrap gap-2">
            {pack.recentCet4.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  setExamId(e.id)
                  setScreen('exam')
                }}
                className="rounded-full bg-stone-100 px-2.5 py-1 text-[11px] text-stone-600 card-press"
              >
                {e.year}.{e.month}
              </button>
            ))}
          </div>
        </div>
      )}

      {pathSteps.map((s) => (
        <button
          key={s.step}
          type="button"
          onClick={s.action}
          className="app-card flex w-full items-center gap-3 p-4 text-left card-press"
        >
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${s.color}`}
          >
            {s.step}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-stone-800">{s.title}</p>
            <p className="text-xs text-stone-500">{s.desc}</p>
          </div>
          <span className="text-stone-300">›</span>
        </button>
      ))}

      <button
        type="button"
        onClick={() => setScreen('favorites')}
        className="app-card flex w-full items-center justify-between p-4 card-press"
      >
        <span className="font-medium text-stone-700">我的收藏</span>
        <span className="text-sm text-amber-600">{favorites.length} 项 ›</span>
      </button>
    </div>
  )
}
