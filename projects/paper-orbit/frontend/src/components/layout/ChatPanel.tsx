import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bot, ChevronDown, CornerDownLeft, Send, Sparkles, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { KnowledgeCard } from '@/components/common/KnowledgeCard'
import { askPaper, askPaperStream } from '@/services/api'
import { usePaperStore } from '@/store/paperStore'
import type { ChatMessage } from '@/types'
import { createId } from '@/utils'

const quickPrompts = ['全文总结', '核心创新点', '实验与指标分析', '解释关键公式']

export function ChatPanel() {
  const { paperId, knowledge, messages, setMessages, pendingQuestion } = usePaperStore()
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const sendingRef = useRef(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'auto'): void => {
    const container = scrollRef.current
    if (!container) return
    container.scrollTo({ top: container.scrollHeight, behavior })
  }

  const updateScrollState = (): void => {
    const container = scrollRef.current
    if (!container) return
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight
    const nearBottom = distance < 72
    stickToBottomRef.current = nearBottom
    setShowJumpToLatest(!nearBottom && messages.length > 0)
  }

  useEffect(() => {
    if (!stickToBottomRef.current) return
    scrollToBottom('auto')
  }, [messages])

  const send = async (preset?: string): Promise<void> => {
    const text = (preset ?? query).trim()
    if (!text || !paperId || sendingRef.current) return
    setQuery('')
    setError('')
    setSending(true)
    sendingRef.current = true
    stickToBottomRef.current = true
    setShowJumpToLatest(false)
    const user: ChatMessage = { id: createId(), role: 'user', content: text }
    const placeholderId = createId()
    const pendingAnswer: ChatMessage = {
      id: placeholderId,
      role: 'assistant',
      content: '',
      pending: true,
    }
    const base = [...messages, user]
    setMessages([...base, pendingAnswer])
    scrollToBottom('smooth')
    try {
      let streamed = ''
      try {
        const answer = await askPaperStream(paperId, text, messages, (token) => {
          streamed += token
          setMessages([...base, {
            id: placeholderId,
            role: 'assistant',
            content: streamed,
            pending: true,
          }])
          if (stickToBottomRef.current) scrollToBottom('auto')
        })
        setMessages([...base, {
          id: placeholderId,
          role: 'assistant',
          content: answer,
          pending: false,
        }])
      } catch {
        const result = await askPaper(paperId, text, messages)
        setMessages([...base, {
          id: placeholderId,
          role: 'assistant',
          content: result.answer,
          pending: false,
        }])
      }
      if (stickToBottomRef.current) scrollToBottom('smooth')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '问答失败')
      setMessages(base)
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  useEffect(() => {
    if (!pendingQuestion || sendingRef.current) return
    const question = pendingQuestion
    usePaperStore.setState({ pendingQuestion: null })
    void send(question)
  }, [pendingQuestion])

  return (
    <aside className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4">
        <Bot className="size-4 text-violet-300" />
        <span className="text-sm font-medium">论文智能体</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-400">
          <i className={`size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399] ${sending ? 'animate-pulse' : ''}`} />
          {sending ? '生成中…' : 'Evidence RAG'}
        </span>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          data-testid="chat-scroll-container"
          onScroll={updateScrollState}
          className="chat-scroll h-full overflow-y-auto overscroll-y-contain p-4"
        >
          {messages.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="rounded-2xl border border-violet-400/15 bg-violet-500/[.07] p-4">
                <Sparkles className="size-5 text-violet-300" />
                <h3 className="mt-3 text-sm font-medium">从哪里开始？</h3>
                <p className="mt-2 text-xs leading-5 text-slate-500">我只依据当前论文回答，回答中会标注章节来源。</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {quickPrompts.map((prompt) => (
                  <button key={prompt} disabled={sending} onClick={() => void send(prompt)} className="rounded-xl border border-white/5 bg-white/[.03] px-3 py-2.5 text-left text-[11px] text-slate-500 transition hover:border-blue-400/30 hover:text-blue-300 disabled:cursor-not-allowed disabled:opacity-50">
                    {prompt}
                  </button>
                ))}
              </div>
              {knowledge && (
                <div className="mt-5 space-y-3">
                  <KnowledgeCard title="实验结论" content={knowledge.experiment_conclusion} accent="cyan" />
                  <KnowledgeCard title="研究局限" content={knowledge.limitations} accent="violet" />
                </div>
              )}
            </motion.div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((message) => (
                  <motion.div key={message.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`flex gap-2 ${message.role === 'user' ? 'justify-end' : ''}`}>
                    {message.role === 'assistant' && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-violet-500/15"><Bot className="size-3.5 text-violet-300" /></span>}
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-3 text-xs leading-6 ${message.role === 'user' ? 'bg-blue-500 text-white' : 'border border-white/8 bg-white/[.04] text-slate-300'}`}>
                      {message.role === 'assistant' && message.pending && !message.content ? (
                        <div data-testid="chat-pending" className="flex items-center gap-2 text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <i className="size-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.2s]" />
                            <i className="size-1.5 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.1s]" />
                            <i className="size-1.5 animate-bounce rounded-full bg-cyan-300" />
                          </span>
                          <span>正在检索原文并生成回答…</span>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                      )}
                    </div>
                    {message.role === 'user' && <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-blue-500/15"><User className="size-3.5 text-blue-300" /></span>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {showJumpToLatest && (
          <button
            type="button"
            data-testid="chat-jump-latest"
            onClick={() => {
              stickToBottomRef.current = true
              setShowJumpToLatest(false)
              scrollToBottom('smooth')
            }}
            className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-cyan-400/30 bg-space-950/90 px-3 py-1.5 text-[10px] text-cyan-300 shadow-lg backdrop-blur"
          >
            <ChevronDown className="size-3" />
            回到最新
          </button>
        )}
      </div>

      {error && <p className="mx-4 mb-2 shrink-0 rounded-lg bg-rose-500/10 px-3 py-2 text-[11px] text-rose-300">{error}</p>}
      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-end gap-2 rounded-xl border border-white/10 bg-black/15 p-2 focus-within:border-blue-400/40">
          <textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send() } }} rows={2} placeholder="询问这篇论文…" className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-xs leading-5 text-slate-200 outline-none placeholder:text-slate-600" />
          <Button size="icon" disabled={sending || !query.trim()} onClick={() => void send()} aria-label={sending ? '正在生成回答' : '发送问题'}>
            {sending ? <CornerDownLeft className="size-4 animate-pulse" /> : <Send className="size-4" />}
          </Button>
        </div>
        <p className="mt-2 text-center text-[9px] text-slate-700">
          {sending ? '正在等待模型返回完整回答…' : 'AI 结论可能存在偏差，请结合来源原文核验'}
        </p>
      </div>
    </aside>
  )
}
