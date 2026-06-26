import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface KnowledgeCardProps {
  title: string
  content: string
  accent?: 'blue' | 'violet' | 'cyan'
}

const gradients = {
  blue: 'from-blue-500/20 to-cyan-500/5',
  violet: 'from-violet-500/20 to-fuchsia-500/5',
  cyan: 'from-cyan-500/20 to-emerald-500/5',
}

function renderDetailContent(content: string) {
  const items = content
    .split(/[；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (items.length >= 2 && items.every((item) => item.length <= 96)) {
    return (
      <ul className="space-y-3 text-sm leading-7 text-slate-300">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-blue-400/80" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    )
  }
  return <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">{content}</p>
}

export function KnowledgeCard({ title, content, accent = 'blue' }: KnowledgeCardProps) {
  const [open, setOpen] = useState(false)
  const preview = content.trim()

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return (
    <>
      <button
        type="button"
        data-testid={`knowledge-card-${title}`}
        className={`group h-44 w-full rounded-2xl border border-white/10 bg-gradient-to-br ${gradients[accent]} p-5 text-left backdrop-blur-xl transition hover:border-blue-400/30 hover:shadow-[0_0_30px_rgba(59,130,246,.12)]`}
        onClick={() => setOpen(true)}
      >
        <div className="flex items-center justify-between">
          <Sparkles className="size-4 text-blue-300" />
          <ArrowRight className="size-4 text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-blue-300" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-slate-200">{title}</h3>
        <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-400">{preview}</p>
        <span className="mt-3 inline-block text-[10px] text-slate-500 group-hover:text-blue-300">点击查看详情</span>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={title}
                data-testid="knowledge-card-detail"
                initial={{ opacity: 0, y: 16, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.98 }}
                className={`glass-panel panel-scroll max-h-[min(80vh,720px)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-br ${gradients[accent]} p-6 shadow-2xl`}
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[.2em] text-slate-500">Knowledge detail</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-100">{title}</h3>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="关闭详情" onClick={() => setOpen(false)}>
                    <X className="size-4" />
                  </Button>
                </div>
                <div className="mt-5 border-t border-white/10 pt-5">
                  {renderDetailContent(preview)}
                </div>
                <p className="mt-6 text-[11px] text-slate-500">基于论文原文萃取 · 按 Esc 或点击空白处关闭</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  )
}
