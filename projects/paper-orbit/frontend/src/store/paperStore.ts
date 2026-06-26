import { create } from 'zustand'
import { getChunk } from '@/services/api'
import type {
  ChapterOutline,
  ChatMessage,
  DocumentChunk,
  FileKind,
  PaperKnowledge,
  ReaderMode,
} from '@/types'
import { shouldSkipOutlinePath } from '@/utils'

interface PaperState {
  paperId: string | null
  filename: string
  localFile: File | null
  fileUrl: string
  fileKind: FileKind | null
  structure: string[]
  outline: ChapterOutline[]
  knowledge: PaperKnowledge | null
  knowledgeTruncated: boolean
  messages: ChatMessage[]
  activeChunk: DocumentChunk | null
  locateText: string | null
  activeChapter: string
  pendingQuestion: string | null
  mode: ReaderMode
  dark: boolean
  setPaper: (payload: {
    paperId: string
    filename: string
    file: File | null
    fileUrl: string
    fileKind: FileKind
    structure: string[]
    outline: ChapterOutline[]
  }) => void
  setKnowledge: (knowledge: PaperKnowledge | null, truncated?: boolean) => void
  setMessages: (messages: ChatMessage[]) => void
  setActiveChunk: (chunk: DocumentChunk | null) => void
  navigateToChapter: (chapterPath: string) => Promise<void>
  enqueueQuestion: (question: string) => void
  setMode: (mode: ReaderMode) => void
  toggleTheme: () => void
  reset: () => void
}

const initial = {
  paperId: null,
  filename: '',
  localFile: null,
  fileUrl: '',
  fileKind: null,
  structure: [] as string[],
  outline: [] as ChapterOutline[],
  knowledge: null as PaperKnowledge | null,
  knowledgeTruncated: false,
  messages: [] as ChatMessage[],
  activeChunk: null as DocumentChunk | null,
  locateText: null as string | null,
  activeChapter: '',
  pendingQuestion: null as string | null,
  mode: 'dashboard' as ReaderMode,
  dark: true,
}

export const usePaperStore = create<PaperState>((set, get) => ({
  ...initial,
  setPaper: (payload) => {
    const oldUrl = get().fileUrl
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    set({
      paperId: payload.paperId,
      filename: payload.filename,
      localFile: payload.file,
      fileUrl: payload.fileUrl,
      fileKind: payload.fileKind,
      structure: payload.structure,
      outline: payload.outline,
      activeChapter: payload.structure.find((path) => !shouldSkipOutlinePath(path)) ?? payload.structure[0] ?? '',
      activeChunk: null,
      locateText: null,
      pendingQuestion: null,
      messages: [],
      knowledge: null,
      knowledgeTruncated: false,
    })
  },
  setKnowledge: (knowledge, truncated = false) => set({ knowledge, knowledgeTruncated: truncated }),
  setMessages: (messages) => set({ messages }),
  setActiveChunk: (activeChunk) => set({ activeChunk, locateText: null, mode: 'reader' }),
  enqueueQuestion: (question) => set({ pendingQuestion: question, mode: 'reader' }),
  navigateToChapter: async (chapterPath) => {
    const { paperId, outline } = get()
    if (!paperId) return
    const item = outline.find((entry) => entry.path === chapterPath)
    set({ activeChapter: chapterPath, mode: 'reader' })
    if (!item) return
    try {
      const chunk = await getChunk(paperId, item.chunk_id)
      set({ activeChunk: chunk, locateText: item.title })
    } catch {
      set({ activeChunk: null, locateText: null })
    }
  },
  setMode: (mode) => set({ mode }),
  toggleTheme: () => set((state) => ({ dark: !state.dark })),
  reset: () => {
    const oldUrl = get().fileUrl
    if (oldUrl) URL.revokeObjectURL(oldUrl)
    set(initial)
  },
}))
