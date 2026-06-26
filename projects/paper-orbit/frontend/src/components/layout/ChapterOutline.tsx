import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { ChevronRight, FileText, ListTree } from 'lucide-react'
import { usePaperStore } from '@/store/paperStore'
import type { ChapterNode } from '@/types'
import { buildChapterTree, resolvePaperTitle } from '@/utils'

function ChapterItem({ node, depth = 0 }: { node: ChapterNode; depth?: number }) {
  const [open, setOpen] = useState(depth < 2)
  const { activeChapter, navigateToChapter } = usePaperStore()
  const active = activeChapter === node.path
  const hasChildren = node.children.length > 0
  const itemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (activeChapter === node.path || activeChapter.startsWith(`${node.path}/`)) {
      setOpen(true)
    }
  }, [activeChapter, node.path])

  useEffect(() => {
    if (!active || !itemRef.current) return
    itemRef.current.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [active])

  const toggleOpen = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation()
    setOpen((value) => !value)
  }

  const handleNavigate = (): void => {
    void navigateToChapter(node.path)
    if (hasChildren) setOpen(true)
  }

  return (
    <div>
      <div
        className={`flex w-full items-center gap-1 rounded-lg transition ${active ? 'bg-blue-500/15' : ''}`}
        style={{ paddingLeft: `${depth * 10}px` }}
      >
        <button
          type="button"
          aria-label={open ? '收起章节' : '展开章节'}
          className={`grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-white/5 ${hasChildren ? '' : 'pointer-events-none opacity-0'}`}
          onClick={toggleOpen}
        >
          <ChevronRight className={`size-3 text-slate-500 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <button
          type="button"
          ref={itemRef}
          data-testid={`chapter-${node.id}`}
          className={`min-w-0 flex-1 rounded-lg px-2 py-2 text-left text-[11px] leading-5 transition hover:bg-black/20 ${active ? 'text-blue-300' : 'text-slate-300'}`}
          onClick={handleNavigate}
        >
          <span className="line-clamp-2">{node.title}</span>
        </button>
      </div>
      {open && hasChildren && (
        <div className="border-l border-white/5" style={{ marginLeft: `${10 + depth * 10}px` }}>
          {node.children.map((child) => <ChapterItem key={child.id} node={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  )
}

export function ChapterOutline() {
  const structure = usePaperStore((state) => state.structure)
  const filename = usePaperStore((state) => state.filename)
  const outline = usePaperStore((state) => state.outline)
  const navigateToChapter = usePaperStore((state) => state.navigateToChapter)
  const paperTitle = useMemo(() => resolvePaperTitle(structure, filename), [structure, filename])
  const tree = useMemo(() => buildChapterTree(structure), [structure])

  if (!outline.length) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-slate-500">
        上传论文后，这里会显示完整章节目录，点击可跳转到原文对应位置。
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3">
      <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <FileText className="size-3.5 text-blue-300" />
          论文标题
        </div>
        <button
          type="button"
          data-testid="paper-title-header"
          onClick={() => {
            const titlePath = structure.find((path) => path === paperTitle)
            if (titlePath) void navigateToChapter(titlePath)
          }}
          className="mt-3 w-full rounded-lg bg-black/20 px-3 py-2.5 text-left text-xs leading-5 text-slate-200 transition hover:border-blue-400/30 hover:text-blue-300"
        >
          {paperTitle}
        </button>
      </section>

      <section className="rounded-xl border border-white/8 bg-white/[.03] p-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ListTree className="size-3.5 text-cyan-300" />
          章节目录
          <span className="ml-auto text-[10px] text-slate-600">{outline.length} 节</span>
        </div>
        <div className="mt-3 space-y-0.5">
          {tree.map((node) => <ChapterItem key={node.id} node={node} />)}
        </div>
      </section>
    </div>
  )
}
