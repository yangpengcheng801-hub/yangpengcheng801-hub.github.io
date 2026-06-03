import {
  cleanMeaningItem,
  isCommonMeaningItem,
  parseMeaningGroups,
  type MeaningWord,
} from './wordMeaning'

/** 词表 / 列表：常考义绿色加粗，拓展义灰色 */
export default function MeaningHighlight({
  word,
  className = 'mt-1 text-xs leading-relaxed',
}: {
  word: MeaningWord
  className?: string
}) {
  const groups = parseMeaningGroups(word.meaning)
  if (!groups.length) {
    return <p className={className}>{word.meaning}</p>
  }

  return (
    <p className={className}>
      {groups.map((group, gi) => (
        <span key={`${word.id}-g-${gi}`}>
          {gi > 0 && <span className="text-slate-300"> </span>}
          {group.pos ? (
            <span className="mr-0.5 font-medium text-indigo-500">{group.pos}</span>
          ) : null}
          {group.items.map((item, ii) => {
            const text = cleanMeaningItem(item) || item
            const isCommon = isCommonMeaningItem(word, item)
            return (
              <span key={`${word.id}-${gi}-${ii}`}>
                {ii > 0 && <span className="text-slate-300">；</span>}
                <span
                  className={
                    isCommon
                      ? 'font-semibold text-emerald-600'
                      : 'text-slate-500'
                  }
                >
                  {text}
                </span>
              </span>
            )
          })}
        </span>
      ))}
    </p>
  )
}
