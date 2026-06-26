import { motion } from 'framer-motion'
import { BookOpen, Database, Gauge, Network } from 'lucide-react'
import type { PaperKnowledge } from '@/types'
import { Card } from '@/components/ui/card'

interface PaperInfoCardProps {
  filename: string
  chapterCount: number
  knowledge: PaperKnowledge
}

export function PaperInfoCard({ filename, chapterCount, knowledge }: PaperInfoCardProps) {
  const stats = [
    { icon: BookOpen, value: chapterCount, label: '章节路径' },
    { icon: Network, value: knowledge.core_innovations.length, label: '创新要点' },
    { icon: Database, value: knowledge.datasets.length, label: '数据集' },
    { icon: Gauge, value: knowledge.metrics.length, label: '评价指标' },
  ]
  return (
    <Card className="relative overflow-hidden p-7">
      <div className="absolute -right-16 -top-20 size-64 rounded-full bg-blue-500/10 blur-3xl" />
      <p className="text-[10px] font-semibold uppercase tracking-[.25em] text-cyan-300">Paper intelligence</p>
      <h1 className="mt-3 max-w-3xl truncate text-2xl font-semibold text-slate-100" title={filename}>{filename}</h1>
      <p className="mt-4 max-w-4xl text-sm leading-7 text-slate-400">{knowledge.research_background}</p>
      <div className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map(({ icon: Icon, value, label }, index) => (
          <motion.div key={label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.08 }} className="rounded-xl border border-white/5 bg-black/15 p-4">
            <Icon className="size-4 text-blue-300" />
            <strong className="mt-3 block text-2xl font-light text-slate-100">{value}</strong>
            <span className="text-[11px] text-slate-500">{label}</span>
          </motion.div>
        ))}
      </div>
    </Card>
  )
}

