import { useEffect, useState } from 'react'
import Particles from '@tsparticles/react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, ChevronLeft, ChevronRight, LayoutDashboard, Moon, Orbit, PanelLeftClose, PanelRightClose, RotateCcw, Sun } from 'lucide-react'
import { UploadArea } from '@/components/common/UploadArea'
import { LoadingRing } from '@/components/common/LoadingRing'
import { KnowledgeCard } from '@/components/common/KnowledgeCard'
import { Sidebar } from '@/components/layout/Sidebar'
import { DocPreview } from '@/components/layout/DocPreview'
import { ChatPanel } from '@/components/layout/ChatPanel'
import { PaperInfoCard } from '@/components/dashboard/PaperInfoCard'
import { ReportExportBar } from '@/components/dashboard/ReportExportBar'
import { InnovationTimeline } from '@/components/dashboard/InnovationTimeline'
import { MetricsChart } from '@/components/dashboard/MetricsChart'
import { Button } from '@/components/ui/button'
import { getKnowledge, getOutline, getPaperFile, getStructure, uploadPaper } from '@/services/api'
import { clearSession, loadSession, saveSession } from '@/services/session'
import { usePaperStore } from '@/store/paperStore'
import type { PaperKnowledge } from '@/types'
import { fileKind } from '@/utils'

const emptyKnowledge = (message: string): PaperKnowledge => ({
  research_background: message,
  core_innovations: [], method_framework: '等待大模型完成知识萃取', key_formulas: [],
  datasets: [], metrics: [], experiment_conclusion: '暂无结论', limitations: '暂无信息', application_scenarios: '暂无信息',
})

function Dashboard() {
  const { filename, structure, knowledge, knowledgeTruncated } = usePaperStore()
  if (!knowledge) return null
  return (
    <motion.main initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto h-[calc(100vh-76px)] max-w-[1500px] overflow-y-auto px-5 pb-10 pt-4">
      {knowledgeTruncated && (
        <div data-testid="knowledge-truncated-warning" className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          论文篇幅较长，知识萃取仅基于前 6 万字符。问答仍可检索全文，但速读报告可能不完整。
        </div>
      )}
      <ReportExportBar />
      <PaperInfoCard filename={filename} chapterCount={structure.length} knowledge={knowledge} />
      <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
        <InnovationTimeline innovations={knowledge.core_innovations} />
        <MetricsChart metrics={knowledge.metrics} datasets={knowledge.datasets} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KnowledgeCard title="方法框架" content={knowledge.method_framework} />
        <KnowledgeCard title="核心结论" content={knowledge.experiment_conclusion} accent="cyan" />
        <KnowledgeCard title="适用场景" content={knowledge.application_scenarios} accent="violet" />
        <KnowledgeCard title="研究局限" content={knowledge.limitations} accent="violet" />
      </div>
    </motion.main>
  )
}

function Reader() {
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  return (
    <motion.main initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid h-[calc(100vh-76px)] min-h-0 min-w-0 gap-3 overflow-hidden p-3 lg:min-w-[980px]" style={{ gridTemplateColumns: `${leftOpen ? 280 : 48}px minmax(320px,1fr) ${rightOpen ? 380 : 48}px` }}>
      <div className="relative h-full min-h-0 overflow-hidden transition-all">
        {leftOpen ? <Sidebar /> : <div className="glass-panel h-full rounded-2xl" />}
        <Button variant="glass" size="icon" className="absolute -right-2 top-3 z-20 size-8" onClick={() => setLeftOpen((value) => !value)}>{leftOpen ? <PanelLeftClose className="size-3.5" /> : <ChevronRight className="size-3.5" />}</Button>
      </div>
      <div className="h-full min-h-0">
        <DocPreview />
      </div>
      <div className="relative h-full min-h-0 overflow-hidden transition-all">
        {rightOpen ? <ChatPanel /> : <div className="glass-panel h-full rounded-2xl" />}
        <Button variant="glass" size="icon" className="absolute -left-2 top-3 z-20 size-8" onClick={() => setRightOpen((value) => !value)}>{rightOpen ? <PanelRightClose className="size-3.5" /> : <ChevronLeft className="size-3.5" />}</Button>
      </div>
    </motion.main>
  )
}

async function hydratePaper(
  paperId: string,
  filename: string,
  file: File | null,
  fileUrl: string,
  store: ReturnType<typeof usePaperStore.getState>,
  setStatus: (value: string) => void,
  setLoadingStep: (value: number) => void,
  setError: (value: string) => void,
): Promise<void> {
  const [structure, outline] = await Promise.all([
    getStructure(paperId),
    getOutline(paperId),
  ])
  store.setPaper({
    paperId,
    filename,
    file,
    fileUrl,
    fileKind: filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'docx',
    structure,
    outline,
  })
  setLoadingStep(1)
  setStatus('正在调用大模型萃取核心知识…')
  try {
    const result = await getKnowledge(paperId)
    store.setKnowledge(result.knowledge, result.truncated)
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : '知识萃取暂不可用'
    store.setKnowledge(emptyKnowledge(message))
    setError(`论文已解析，但知识萃取失败：${message}`)
  }
}

export default function App() {
  const store = usePaperStore()
  const [stage, setStage] = useState<'upload' | 'loading' | 'main'>('upload')
  const [loadingStep, setLoadingStep] = useState(0)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [restoring, setRestoring] = useState(true)

  useEffect(() => { document.documentElement.classList.toggle('dark', store.dark); document.documentElement.classList.toggle('light', !store.dark) }, [store.dark])

  useEffect(() => {
    const session = loadSession()
    if (!session) {
      setRestoring(false)
      return
    }
    void (async () => {
      setStage('loading')
      setLoadingStep(0)
      setStatus('正在恢复上次阅读的论文…')
      try {
        const blob = await getPaperFile(session.paperId)
        const restoredFile = new File([blob], session.filename, { type: blob.type || 'application/pdf' })
        const fileUrl = URL.createObjectURL(restoredFile)
        await hydratePaper(session.paperId, session.filename, restoredFile, fileUrl, store, setStatus, setLoadingStep, setError)
        setLoadingStep(2)
        setStatus('阅读空间已恢复')
        await new Promise((resolve) => window.setTimeout(resolve, 400))
        setStage('main')
      } catch {
        clearSession()
        setStage('upload')
      } finally {
        setRestoring(false)
      }
    })()
  }, [])

  const handleUpload = async (file: File): Promise<void> => {
    setStage('loading')
    setLoadingStep(0)
    setUploadProgress(0)
    setStatus('正在上传并解析章节与版面…')
    setError('')
    try {
      const uploaded = await uploadPaper(file, (percent) => {
        setUploadProgress(percent)
        if (percent >= 100) {
          setLoadingStep(1)
          setStatus('正在生成本地语义向量，首次运行会下载模型…')
        }
      })
      const fileUrl = URL.createObjectURL(file)
      store.setPaper({
        paperId: uploaded.paper_id,
        filename: uploaded.filename,
        file,
        fileUrl,
        fileKind: fileKind(file),
        structure: uploaded.structure,
        outline: uploaded.outline,
      })
      saveSession({ paperId: uploaded.paper_id, filename: uploaded.filename })
      setLoadingStep(1)
      setStatus('正在调用大模型萃取核心知识…')
      try {
        const result = await getKnowledge(uploaded.paper_id)
        store.setKnowledge(result.knowledge, result.truncated)
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '知识萃取暂不可用'
        store.setKnowledge(emptyKnowledge(message))
        setError(`论文已解析，但知识萃取失败：${message}`)
      }
      setLoadingStep(2)
      setStatus('索引已就绪，即将进入阅读空间')
      await new Promise((resolve) => window.setTimeout(resolve, 650))
      setStage('main')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '上传失败，请检查后端服务')
      setStage('upload')
    }
  }

  const reset = (): void => {
    clearSession()
    store.reset()
    setError('')
    setUploadProgress(0)
    setStage('upload')
  }

  if (restoring && stage === 'upload') {
    return <div className="grid min-h-screen place-items-center bg-space-950 text-slate-400">正在恢复阅读会话…</div>
  }

  return (
    <div className="min-h-screen overflow-hidden bg-space-950 text-slate-100 transition-colors duration-500">
      <div className="pointer-events-none fixed inset-0 bg-grid bg-[size:42px_42px]" />
      <div className="pointer-events-none fixed left-1/4 top-0 size-[500px] rounded-full bg-blue-600/10 blur-[140px]" />
      <AnimatePresence mode="wait">
        {stage === 'upload' && (
          <motion.main key="upload" exit={{ opacity: 0, scale: 1.02 }} className="relative grid min-h-screen place-items-center px-5 py-16">
            <Particles className="absolute inset-0" options={{ fullScreen: { enable: false }, background: { color: { value: 'transparent' } }, particles: { number: { value: 42 }, color: { value: ['#3b82f6', '#8b5cf6'] }, opacity: { value: { min: .08, max: .3 } }, size: { value: { min: 1, max: 3 } }, links: { enable: true, opacity: .08, distance: 130, color: '#60a5fa' }, move: { enable: true, speed: .35 } } }} />
            <div className="relative z-10 flex w-full flex-col items-center">
              <div className="mb-9 flex items-center gap-3"><span className="grid size-10 place-items-center rounded-2xl border border-blue-400/25 bg-blue-500/10 shadow-neon"><Orbit className="size-5 text-blue-300" /></span><div><strong className="block tracking-tight">Paper Orbit</strong><span className="text-[10px] uppercase tracking-[.22em] text-slate-600">Intelligent reading space</span></div></div>
              <p className="mb-3 text-center text-xs font-semibold uppercase tracking-[.3em] text-blue-400">Evidence-grounded research agent</p>
              <h1 className="mb-4 bg-gradient-to-r from-white via-blue-100 to-violet-300 bg-clip-text text-center text-4xl font-semibold tracking-tight text-transparent md:text-6xl">让论文，从文字变成知识</h1>
              <p className="mb-10 max-w-2xl text-center text-sm leading-7 text-slate-500">结构解析、核心萃取、语义问答与原文证据定位，在一个沉浸式空间里完成。</p>
              <UploadArea onUpload={(file) => void handleUpload(file)} />
              {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-5 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{error}</motion.p>}
            </div>
          </motion.main>
        )}
        {stage === 'loading' && <motion.main key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid min-h-screen place-items-center"><LoadingRing step={loadingStep} label={status} progress={uploadProgress} /></motion.main>}
        {stage === 'main' && (
          <motion.div key="main" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <header data-testid="main-ready" className="relative z-30 flex h-16 items-center border-b border-white/8 bg-space-950/70 px-5 backdrop-blur-2xl">
              <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500"><Orbit className="size-4" /></span><div className="min-w-0"><strong className="block truncate text-sm">{store.filename}</strong><span className="text-[10px] text-emerald-400">● 智能索引已连接</span></div></div>
              <div className="mx-auto flex rounded-xl border border-white/8 bg-white/[.03] p-1"><Button variant={store.mode === 'dashboard' ? 'glass' : 'ghost'} size="sm" onClick={() => store.setMode('dashboard')}><LayoutDashboard className="size-3.5" />速读报告</Button><Button variant={store.mode === 'reader' ? 'glass' : 'ghost'} size="sm" onClick={() => store.setMode('reader')}><BookOpen className="size-3.5" />原文阅读</Button></div>
              <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={store.toggleTheme}>{store.dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</Button><Button variant="ghost" size="icon" onClick={reset}><RotateCcw className="size-4" /></Button></div>
            </header>
            {error && <div className="fixed right-5 top-20 z-50 max-w-md rounded-xl border border-amber-400/20 bg-amber-950/90 px-4 py-3 text-xs text-amber-200 shadow-2xl">{error}</div>}
            {store.mode === 'dashboard' ? <Dashboard /> : <Reader />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
