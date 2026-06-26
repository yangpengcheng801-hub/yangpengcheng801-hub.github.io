import { motion } from 'framer-motion'
import { Check, Orbit } from 'lucide-react'

interface LoadingRingProps {
  step: number
  label?: string
  progress?: number
}

const steps = ['解析文档结构', '萃取核心知识', '构建语义向量']

export function LoadingRing({ step, label, progress = 0 }: LoadingRingProps) {
  return (
    <motion.div className="flex flex-col items-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="relative grid size-48 place-items-center">
        <motion.div className="absolute inset-0 rounded-full border border-blue-400/20" animate={{ rotate: 360 }} transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}>
          <span className="absolute left-1/2 top-0 size-3 -translate-x-1/2 rounded-full bg-cyan-300 shadow-[0_0_24px_#22d3ee]" />
        </motion.div>
        <motion.div className="absolute inset-5 rounded-full border border-violet-400/25 border-r-violet-400" animate={{ rotate: -360 }} transition={{ duration: 3.5, repeat: Infinity, ease: 'linear' }} />
        <div className="grid size-28 place-items-center rounded-full bg-blue-500/10 shadow-[inset_0_0_30px_rgba(59,130,246,.18)]">
          <Orbit className="size-10 text-blue-300" />
        </div>
      </div>
      <h2 data-testid="loading-title" className="mt-8 text-xl font-semibold">AI 正在阅读论文</h2>
      <p data-testid="loading-status" className="mt-2 text-sm text-slate-500">{label ?? '首次运行可能需要下载本地嵌入模型'}</p>
      {progress > 0 && (
        <div className="mt-5 w-72">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div data-testid="upload-progress-bar" className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p data-testid="upload-progress-text" className="mt-2 text-center text-xs text-cyan-300">上传进度 {progress}%</p>
        </div>
      )}
      <div className="mt-8 flex gap-6">
        {steps.map((item, index) => (
          <div key={item} className={`flex items-center gap-2 text-xs ${index <= step ? 'text-cyan-300' : 'text-slate-600'}`}>
            <span className={`grid size-5 place-items-center rounded-full border ${index <= step ? 'border-cyan-300/50 bg-cyan-400/10' : 'border-slate-700'}`}>
              {index < step ? <Check className="size-3" /> : index + 1}
            </span>
            {item}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
