import type { DictEntry } from './dictionary'
import { speakWord } from './speech'

function dictSourceLabel(source?: DictEntry['source']) {
  if (source === 'local') return '四级词库'
  if (source === 'cached') return '已缓存'
  if (source === 'youdao') return '有道词典'
  if (source === 'ai') return 'AI 查词'
  return ''
}

export default function DictionaryPopup({
  displayWord,
  entry,
  loading,
  error,
  onClose,
}: {
  displayWord: string
  entry: DictEntry | null
  loading?: boolean
  error?: string
  onClose: () => void
}) {
  const sourceLabel = dictSourceLabel(entry?.source)

  return (
    <div className="app-sheet app-sheet--dict" onClick={onClose}>
      <div className="app-sheet-panel text-center" onClick={(e) => e.stopPropagation()}>
        <p className="text-2xl font-bold text-indigo-600">{displayWord}</p>
        {entry?.phonetic && <p className="mt-1 text-sm text-slate-400">{entry.phonetic}</p>}
        {entry?.pos && <p className="mt-1 text-xs text-indigo-500">{entry.pos}</p>}
        {entry?.matched && entry.matched !== displayWord.toLowerCase() && (
          <p className="mt-1 text-xs text-slate-400">词形变化，词根：{entry.matched}</p>
        )}
        {loading && (
          <p className="mt-3 text-sm text-slate-400 animate-pulse">联网查词中…</p>
        )}
        {!loading && entry && (
          <p className="mt-3 text-base leading-relaxed text-slate-700">{entry.meaning}</p>
        )}
        {!loading && !entry && (
          <p className="mt-3 text-sm text-slate-500">
            {error || '未找到释义，请检查网络或配置 AI Key 后重试'}
          </p>
        )}
        {!loading && sourceLabel && (
          <p className="mt-2 text-[11px] text-slate-400">{sourceLabel}</p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => speakWord(displayWord)}
            className="flex-1 rounded-xl bg-violet-100 py-2.5 text-sm font-medium text-violet-700 card-press"
            disabled={loading}
          >
            发音
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-indigo-500 py-2.5 text-sm font-medium text-white card-press"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
