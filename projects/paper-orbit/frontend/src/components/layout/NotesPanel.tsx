import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { loadPaperNotes, savePaperNotes } from '@/services/notes'
import { usePaperStore } from '@/store/paperStore'

export function NotesPanel() {
  const paperId = usePaperStore((state) => state.paperId)
  const knowledge = usePaperStore((state) => state.knowledge)
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!paperId) return
    setNotes(loadPaperNotes(paperId))
  }, [paperId])

  const persist = (): void => {
    if (!paperId) return
    savePaperNotes(paperId, notes)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 1500)
  }

  const insertSummary = (): void => {
    if (!knowledge) return
    const summary = [
      '## AI 摘要',
      knowledge.research_background,
      '',
      '### 创新点',
      ...knowledge.core_innovations.map((item) => `- ${item}`),
      '',
      '### 结论',
      knowledge.experiment_conclusion,
      '',
    ].join('\n')
    setNotes((value) => `${value.trim()}\n\n${summary}`.trim())
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-[10px] uppercase tracking-[.2em] text-slate-600">Notes</p>
          <h3 className="mt-1 text-sm font-medium text-slate-200">阅读笔记</h3>
        </div>
        <Button variant="ghost" size="sm" onClick={insertSummary}>
          <Sparkles className="mr-1 size-3" />
          插入摘要
        </Button>
      </div>
      <textarea
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="记录你的阅读批注、问题与总结…"
        className="panel-scroll min-h-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/15 px-3 py-3 text-xs leading-6 text-slate-300 outline-none placeholder:text-slate-600"
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-slate-600">自动保存在本机浏览器</span>
        <Button size="sm" onClick={persist}>{saved ? '已保存' : '保存笔记'}</Button>
      </div>
    </div>
  )
}
