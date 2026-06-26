import { useRef, useState, type DragEvent } from 'react'
import { motion } from 'framer-motion'
import { FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils'

interface UploadAreaProps {
  onUpload: (file: File) => void
  disabled?: boolean
}

export function UploadArea({ onUpload, disabled = false }: UploadAreaProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')

  const validate = (file?: File): void => {
    if (!file) return
    if (!/\.(pdf|docx)$/i.test(file.name)) {
      setError('格式不支持，请选择 PDF 或 DOCX 文件')
      return
    }
    setError('')
    onUpload(file)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    validate(event.dataTransfer.files[0])
  }

  return (
    <div className="w-full max-w-3xl">
      <motion.div
        animate={error ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
        className={cn('relative overflow-hidden rounded-[2rem] border border-dashed p-2 transition-all duration-300', dragging ? 'border-cyan-300 bg-cyan-400/10 shadow-neon' : 'border-blue-400/25 bg-white/[.025]')}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="grid min-h-80 place-items-center rounded-[1.6rem] bg-[radial-gradient(circle_at_50%_0%,rgba(59,130,246,.12),transparent_50%)] px-8 text-center backdrop-blur-xl">
          <div>
            <motion.div className="mx-auto grid size-20 place-items-center rounded-3xl border border-blue-400/20 bg-blue-500/10" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
              {dragging ? <FileText className="size-9 text-cyan-300" /> : <UploadCloud className="size-9 text-blue-300" />}
            </motion.div>
            <h2 className="mt-7 text-2xl font-semibold text-slate-100">拖入一篇论文，开启深度阅读</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-500">支持 PDF 与 Word，系统将自动解析章节、萃取知识并构建可追溯的语义索引。</p>
            <input ref={inputRef} type="file" accept=".pdf,.docx" className="hidden" onChange={(event) => validate(event.target.files?.[0])} />
            <Button className="mt-7 px-7" disabled={disabled} onClick={() => inputRef.current?.click()}>选择论文文件</Button>
            <p className="mt-4 text-xs text-slate-600">PDF · DOCX · 最大文件大小由后端配置决定</p>
          </div>
        </div>
      </motion.div>
      {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 text-center text-sm text-rose-400">{error}</motion.p>}
    </div>
  )
}

