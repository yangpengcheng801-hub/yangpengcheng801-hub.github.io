import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { renderAsync } from 'docx-preview'
import { ChevronLeft, ChevronRight, Minus, Plus, ScanText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaperStore } from '@/store/paperStore'
import { clearAllPdfHighlights, locateAndScrollToChunk } from '@/utils/pdfLocate'
import {
  annotateDocxBlocks,
  clearDocxHighlights,
  locateAndHighlightDocx,
  scrollToDocxBlock,
} from '@/utils/docxLocate'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface PdfLoadResult { numPages: number }

function expandNearPages(pageNum: number, total: number): number[] {
  const result: number[] = []
  for (let index = pageNum - 1; index <= pageNum + 1; index += 1) {
    if (index >= 1 && index <= total) result.push(index)
  }
  return result
}

export function DocPreview() {
  const { fileUrl, localFile, fileKind, activeChunk, locateText, mode } = usePaperStore()
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  const [scale, setScale] = useState(1)
  const [locateReady, setLocateReady] = useState(false)
  const [docxReady, setDocxReady] = useState(false)
  const [containerWidth, setContainerWidth] = useState(720)
  const [pageHeight, setPageHeight] = useState(980)
  const [nearPages, setNearPages] = useState<Set<number>>(() => new Set([1, 2, 3]))
  const [readyPages, setReadyPages] = useState<Set<number>>(() => new Set())
  const wordRef = useRef<HTMLDivElement>(null)
  const pdfHostRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const readyPagesRef = useRef(readyPages)
  const activeChunkRef = useRef(activeChunk)
  const locateTextRef = useRef(locateText)
  const locatedChunkIdRef = useRef<string | null>(null)
  activeChunkRef.current = activeChunk
  locateTextRef.current = locateText
  readyPagesRef.current = readyPages

  const pageNumbers = useMemo(
    () => Array.from({ length: pages }, (_, index) => index + 1),
    [pages],
  )
  const pageWidth = Math.max(320, Math.floor((containerWidth - 48) * scale))

  const ensureNearPages = useCallback((pageNum: number): void => {
    setNearPages((prev) => {
      const next = new Set(prev)
      expandNearPages(pageNum, pages).forEach((value) => next.add(value))
      return next
    })
  }, [pages])

  const scrollToPage = useCallback((pageNum: number, behavior: ScrollBehavior = 'smooth'): void => {
    ensureNearPages(pageNum)
    const container = scrollContainerRef.current
    if (!container) return
    if (pageNum <= 1) {
      container.scrollTo({ top: 0, behavior })
      setPage(1)
      return
    }
    const target = pageRefs.current.get(pageNum)
    if (!target) return
    const top = target.offsetTop - container.offsetTop - 8
    container.scrollTo({ top: Math.max(0, top), behavior })
    setPage(pageNum)
  }, [ensureNearPages])

  const applyDocxLocate = useCallback((shouldScroll: boolean) => {
    const chunk = activeChunkRef.current
    const scrollContainer = scrollContainerRef.current
    const host = wordRef.current
    if (!chunk || fileKind !== 'docx' || !scrollContainer || !host || !docxReady) return false

    const located = locateAndHighlightDocx(
      scrollContainer,
      host,
      chunk.content,
      chunk.position,
      locateTextRef.current,
      shouldScroll,
    )
    setLocateReady(located)
    if (located && shouldScroll) locatedChunkIdRef.current = chunk.chunk_id
    return located
  }, [docxReady, fileKind])

  const applyParagraphLocate = useCallback((shouldScroll: boolean) => {
    const chunk = activeChunkRef.current
    const scrollContainer = scrollContainerRef.current
    const pdfHost = pdfHostRef.current
    if (!chunk || fileKind !== 'pdf' || !scrollContainer || !pdfHost) return false

    const pageNum = chunk.page_num ?? page
    if (!readyPagesRef.current.has(pageNum)) return false

    const pageRoot = pdfHost.querySelector(`[data-pdf-page="${pageNum}"]`)
    const canvas = pageRoot?.querySelector('.react-pdf__Page__canvas')
    const textLayer = pageRoot?.querySelector('.react-pdf__Page__textContent')
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 10) return false
    if (!(textLayer instanceof HTMLElement)) return false

    clearAllPdfHighlights(pdfHost)
    const highlightText = locateTextRef.current ?? chunk.content
    const located = locateAndScrollToChunk(scrollContainer, textLayer, highlightText, shouldScroll)
    setLocateReady(located)
    if (located && shouldScroll) locatedChunkIdRef.current = chunk.chunk_id
    return located
  }, [fileKind, page])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return
    const updateWidth = (): void => setContainerWidth(container.clientWidth)
    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (fileKind !== 'pdf' || !fileUrl || activeChunk) return
    const container = scrollContainerRef.current
    if (!container) return
    container.scrollTo({ top: 0, behavior: 'auto' })
    setPage(1)
  }, [fileKind, fileUrl, mode, activeChunk])

  useEffect(() => {
    if (!activeChunk?.page_num) return
    locatedChunkIdRef.current = null
    setLocateReady(false)
    ensureNearPages(activeChunk.page_num)
    scrollToPage(activeChunk.page_num, 'smooth')
  }, [activeChunk?.chunk_id, activeChunk?.page_num, ensureNearPages, scrollToPage])

  useEffect(() => {
    if (fileKind !== 'pdf' || !activeChunk) return
    setLocateReady(false)
    let attempts = 0
    let cancelled = false
    const timers: number[] = []
    const retry = (): void => {
      if (cancelled) return
      attempts += 1
      if (activeChunk.page_num) ensureNearPages(activeChunk.page_num)
      const shouldScroll = locatedChunkIdRef.current !== activeChunk.chunk_id
      const ok = applyParagraphLocate(shouldScroll)
      if (!ok && attempts < 12) timers.push(window.setTimeout(retry, 250))
    }
    timers.push(window.requestAnimationFrame(retry))
    timers.push(window.setTimeout(retry, 400))
    return () => {
      cancelled = true
      timers.forEach((id) => {
        window.clearTimeout(id)
        window.cancelAnimationFrame(id)
      })
    }
  }, [activeChunk?.chunk_id, locateText, scale, applyParagraphLocate, fileKind, ensureNearPages])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container || fileKind !== 'pdf' || pages <= 1) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          const current = Number((entry.target as HTMLElement).dataset.pdfPage)
          if (current > 0) ensureNearPages(current)
        })
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]?.target
        if (!(top instanceof HTMLElement)) return
        const current = Number(top.dataset.pdfPage)
        if (current > 0) setPage(current)
      },
      { root: container, threshold: [0.35, 0.55, 0.75] },
    )

    pageRefs.current.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [fileKind, pages, scale, ensureNearPages])

  useEffect(() => {
    if (fileKind !== 'docx' || !localFile || !wordRef.current) return
    const container = wordRef.current
    container.innerHTML = ''
    setDocxReady(false)
    setLocateReady(false)
    void localFile.arrayBuffer().then((buffer) => renderAsync(buffer, container, undefined, {
      className: 'docx-paper', inWrapper: true, ignoreWidth: false, ignoreHeight: false,
    }).then(() => {
      annotateDocxBlocks(container)
      setDocxReady(true)
    }))
  }, [fileKind, localFile])

  useEffect(() => {
    if (fileKind !== 'docx' || !activeChunk || !docxReady) return
    locatedChunkIdRef.current = null
    setLocateReady(false)
    let attempts = 0
    let cancelled = false
    const timers: number[] = []
    const retry = (): void => {
      if (cancelled) return
      attempts += 1
      const shouldScroll = locatedChunkIdRef.current !== activeChunk.chunk_id
      const ok = applyDocxLocate(shouldScroll)
      if (!ok && attempts < 10) timers.push(window.setTimeout(retry, 200))
    }
    timers.push(window.requestAnimationFrame(retry))
    return () => {
      cancelled = true
      timers.forEach((id) => {
        window.clearTimeout(id)
        window.cancelAnimationFrame(id)
      })
    }
  }, [activeChunk?.chunk_id, locateText, docxReady, applyDocxLocate, fileKind])

  useEffect(() => {
    if (fileKind !== 'docx' || !locateText || activeChunk || !docxReady) return
    const scrollContainer = scrollContainerRef.current
    const host = wordRef.current
    if (!scrollContainer || !host) return
    scrollToDocxBlock(scrollContainer, host, undefined, locateText)
  }, [fileKind, locateText, activeChunk, docxReady])

  return (
    <section className="glass-panel flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="flex items-center gap-2 text-xs text-slate-400"><ScanText className="size-4 text-cyan-300" />原文阅读</div>
        <div className="flex items-center gap-1">
          {fileKind === 'pdf' && (
            <>
              <Button variant="ghost" size="icon" onClick={() => scrollToPage(Math.max(1, page - 1))}><ChevronLeft className="size-4" /></Button>
              <span data-testid="pdf-page-indicator" className="min-w-16 text-center text-xs text-slate-500">{page} / {pages}</span>
              <Button variant="ghost" size="icon" onClick={() => scrollToPage(Math.min(pages, page + 1))}><ChevronRight className="size-4" /></Button>
            </>
          )}
          <Button variant="ghost" size="icon" onClick={() => setScale((value) => Math.max(.6, value - .1))}><Minus className="size-4" /></Button>
          <span className="w-12 text-center text-[11px] text-slate-500">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="icon" onClick={() => setScale((value) => Math.min(1.8, value + .1))}><Plus className="size-4" /></Button>
        </div>
      </div>
      {activeChunk && (
        <div data-testid="chunk-highlight-banner" className="mx-4 mt-3 shrink-0 rounded-xl border border-cyan-400/25 bg-cyan-400/[.07] p-3 text-xs leading-5 text-slate-300 shadow-[0_0_25px_rgba(34,211,238,.08)]">
          {locateText ? (
            <span className="mr-2 text-cyan-300">章节定位 · {locateText}</span>
          ) : (
            <>
              <span className="mr-2 text-cyan-300">AI 定位 · {activeChunk.position}</span>
              {activeChunk.content.slice(0, 220)}
            </>
          )}
          {fileKind === 'pdf' && (
            <span data-testid="pdf-locate-status" className="ml-2 text-[10px] text-cyan-200/80">
              {locateReady
                ? (locateText ? '· 已定位到章节标题' : '· 已定位到段落')
                : (locateText ? '· 正在定位章节标题…' : '· 正在定位段落…')}
            </span>
          )}
          {fileKind === 'docx' && (
            <span data-testid="docx-locate-status" className="ml-2 text-[10px] text-cyan-200/80">
              {locateReady
                ? (locateText ? '· 已定位到章节标题' : '· 已定位到段落')
                : (docxReady ? '· 正在定位段落…' : '· 正在加载 Word…')}
            </span>
          )}
        </div>
      )}
      <div
        ref={scrollContainerRef}
        data-testid="pdf-scroll-container"
        className="panel-scroll min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-black/20 px-5 pb-5 pt-2"
      >
        {fileKind === 'pdf' && fileUrl && (
          <Document
            file={fileUrl}
            loading={<p className="py-20 text-center text-sm text-slate-500">正在渲染 PDF…</p>}
            onLoadSuccess={({ numPages }: PdfLoadResult) => {
              setPages(numPages)
              setPage(1)
              setNearPages(new Set(expandNearPages(1, numPages)))
              setReadyPages(new Set())
              window.requestAnimationFrame(() => {
                scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' })
              })
            }}
          >
            <div ref={pdfHostRef} className="mx-auto flex w-full max-w-full flex-col items-center gap-8">
              {pageNumbers.map((pageNumber) => (
                <div
                  key={pageNumber}
                  ref={(element) => {
                    if (element) pageRefs.current.set(pageNumber, element)
                    else pageRefs.current.delete(pageNumber)
                  }}
                  data-pdf-page={pageNumber}
                  data-testid={`pdf-page-${pageNumber}`}
                  className="w-full max-w-full overflow-hidden rounded-sm bg-white shadow-2xl"
                  style={{ minHeight: nearPages.has(pageNumber) ? undefined : pageHeight }}
                >
                  {nearPages.has(pageNumber) ? (
                    <Page
                      pageNumber={pageNumber}
                      width={pageWidth}
                      loading={(
                        <div className="flex items-center justify-center bg-slate-100 text-sm text-slate-500" style={{ width: pageWidth, height: pageHeight }}>
                          正在加载第 {pageNumber} 页…
                        </div>
                      )}
                      onRenderSuccess={() => {
                        setReadyPages((prev) => {
                          const next = new Set(prev)
                          next.add(pageNumber)
                          readyPagesRef.current = next
                          return next
                        })
                        const pageRoot = pageRefs.current.get(pageNumber)
                        const canvas = pageRoot?.querySelector('.react-pdf__Page__canvas')
                        if (canvas instanceof HTMLCanvasElement && canvas.height > 0) {
                          setPageHeight(Math.max(640, canvas.clientHeight))
                        }
                        if (activeChunkRef.current?.page_num === pageNumber) {
                          const chunkId = activeChunkRef.current.chunk_id
                          const shouldScroll = locatedChunkIdRef.current !== chunkId
                          window.requestAnimationFrame(() => applyParagraphLocate(shouldScroll))
                        }
                      }}
                    />
                  ) : (
                    <div
                      className="flex items-center justify-center bg-slate-100 text-sm text-slate-500"
                      style={{ width: pageWidth, height: pageHeight }}
                    >
                      滚动到此处加载第 {pageNumber} 页
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Document>
        )}
        {fileKind === 'docx' && (
          <div className="mx-auto w-fit origin-top" style={{ transform: `scale(${scale})` }}>
            <div ref={wordRef} className="docx-host" />
          </div>
        )}
      </div>
    </section>
  )
}
