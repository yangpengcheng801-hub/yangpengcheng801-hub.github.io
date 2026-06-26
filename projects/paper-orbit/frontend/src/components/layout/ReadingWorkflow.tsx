import { usePaperStore } from '@/store/paperStore'
import { READING_TEMPLATES } from '@/services/notes'

export function ReadingWorkflow() {
  const enqueueQuestion = usePaperStore((state) => state.enqueueQuestion)

  return (
    <div className="space-y-3 p-3">
      <div>
        <p className="text-[10px] uppercase tracking-[.2em] text-slate-600">Reading workflow</p>
        <h3 className="mt-1 text-sm font-medium text-slate-200">七问 / 三遍阅读</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">点击模板会自动切到原文阅读并发起问答。</p>
      </div>
      <div className="space-y-2">
        {READING_TEMPLATES.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => enqueueQuestion(item.prompt)}
            className="w-full rounded-xl border border-white/8 bg-white/[.03] px-3 py-2.5 text-left transition hover:border-violet-400/30 hover:bg-violet-500/10"
          >
            <p className="text-xs font-medium text-slate-200">{item.title}</p>
            <p className="mt-1 text-[11px] text-slate-500">{item.description}</p>
          </button>
        ))}
      </div>
    </div>
  )
}
