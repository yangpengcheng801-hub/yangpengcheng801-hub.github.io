import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface InnovationTimelineProps {
  innovations: string[]
}

export function InnovationTimeline({ innovations }: InnovationTimelineProps) {
  const items = innovations.length ? innovations : ['原文未明确列出创新点']
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2"><Sparkles className="size-4 text-violet-300" /><h2 className="text-sm font-semibold">创新脉络</h2></div>
      <div className="relative mt-6 space-y-6 before:absolute before:left-[9px] before:top-2 before:h-[calc(100%-16px)] before:w-px before:bg-gradient-to-b before:from-violet-400 before:to-transparent">
        {items.map((item, index) => (
          <motion.div key={`${index}-${item}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.12 }} className="relative pl-8">
            <span className="absolute left-0 top-1 grid size-[19px] place-items-center rounded-full border border-violet-400/50 bg-space-900 text-[9px] text-violet-300">{index + 1}</span>
            <p className="text-sm leading-6 text-slate-400">{item}</p>
          </motion.div>
        ))}
      </div>
    </Card>
  )
}

