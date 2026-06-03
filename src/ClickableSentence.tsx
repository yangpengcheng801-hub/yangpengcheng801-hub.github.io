import { type ReactNode } from 'react'
import { normalizeDictWord, type DictEntry } from './dictionary'

const WORD_RE = /\b([a-zA-Z]+(?:'[a-zA-Z]+)?)\b/g

export type WordTapInfo = {
  display: string
  entry: DictEntry | null
  isTarget: boolean
}

type ClickableSentenceProps = {
  text: string
  targetWords: Set<string>
  onWordTap: (info: WordTapInfo) => void
  lookup: (word: string) => DictEntry | null
  targetHighlightClass: string
}

export default function ClickableSentence({
  text,
  targetWords,
  onWordTap,
  lookup,
  targetHighlightClass,
}: ClickableSentenceProps) {
  const parts: ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  WORD_RE.lastIndex = 0
  while ((match = WORD_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    const display = match[0]
    const key = normalizeDictWord(display)
    const isTarget = targetWords.has(key)
    const entry = lookup(display)

    parts.push(
      <span
        key={`${match.index}-${display}`}
        className={isTarget ? `word-highlight ${targetHighlightClass}` : 'word-tap'}
        onClick={() => onWordTap({ display, entry, isTarget })}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onWordTap({ display, entry, isTarget })
        }}
        title={entry ? '点击查看释义' : '点击查看（可能未收录）'}
      >
        {display}
      </span>,
    )
    lastIndex = match.index + display.length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))

  return <>{parts}</>
}
