import { useMemo } from 'react'
import { BookMarked, FlaskConical, FunctionSquare, MapPin } from 'lucide-react'
import { usePaperStore } from '@/store/paperStore'

const anchorRules = [
  { label: '引言', pattern: /引言|绪论/i },
  { label: '方法', pattern: /方法|技术|框架/i },
  { label: '实验', pattern: /实验|指标|测试|验证/i },
  { label: '结论', pattern: /结论|结束语|展望/i },
  { label: '文献', pattern: /参考文献|references/i },
] as const

export function ReadingInsights() {
  const { knowledge, outline, activeChapter, navigateToChapter } = usePaperStore()

  const progress = useMemo(() => {
    if (!outline.length) return { percent: 0, label: '尚未解析章节' }
    const index = outline.findIndex(
      (item) => activeChapter === item.path || activeChapter.startsWith(`${item.path}/`),
    )
    const current = index >= 0 ? index + 1 : 1
    return {
      percent: Math.round((current / outline.length) * 100),
      label: `第 ${current} / ${outline.length} 个阅读锚点`,
    }
  }, [outline, activeChapter])

  const anchors = useMemo(
    () => anchorRules
      .map((rule) => ({
        label: rule.label,
        item: outline.find((entry) => rule.pattern.test(entry.title) || rule.pattern.test(entry.path)),
      }))
      .filter((entry) => entry.item),
    [outline],
  )

  if (!knowledge) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-slate-500">
        上传论文并完成知识萃取后，这里会显示阅读进度、关键公式与快速跳转。
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3">
      <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <MapPin className="size-3.5 text-cyan-300" />
          阅读进度
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${Math.max(progress.percent, 4)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{progress.label}</p>
        {activeChapter && (
          <p className="mt-1 line-clamp-2 text-xs text-cyan-200/90">当前：{activeChapter.split('/').pop()}</p>
        )}
      </section>

      {anchors.length > 0 && (
        <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <BookMarked className="size-3.5 text-violet-300" />
            快速跳转
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {anchors.map(({ label, item }) => (
              <button
                key={label}
                type="button"
                onClick={() => item && void navigateToChapter(item.path)}
                className="rounded-lg border border-white/8 bg-black/20 px-3 py-1.5 text-[11px] text-slate-300 transition hover:border-blue-400/30 hover:text-blue-300"
              >
                {label}
              </button>
            ))}
          </div>
        </section>
      )}

      {knowledge.key_formulas.length > 0 && (
        <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <FunctionSquare className="size-3.5 text-amber-300" />
            关键公式
          </div>
          <ul className="mt-3 space-y-2">
            {knowledge.key_formulas.map((formula) => (
              <li key={formula} className="rounded-lg bg-black/20 px-3 py-2 text-[11px] leading-5 text-slate-300">
                {formula}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FlaskConical className="size-3.5 text-emerald-300" />
          实验要素
        </div>
        <div className="mt-3 space-y-3">
          {knowledge.metrics.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[.18em] text-slate-600">指标</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {knowledge.metrics.map((metric) => (
                  <span key={metric} className="rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">
                    {metric}
                  </span>
                ))}
              </div>
            </div>
          )}
          {knowledge.datasets.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[.18em] text-slate-600">数据集</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {knowledge.datasets.map((dataset) => (
                  <span key={dataset} className="rounded-md bg-blue-500/10 px-2 py-1 text-[10px] text-blue-300">
                    {dataset}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
