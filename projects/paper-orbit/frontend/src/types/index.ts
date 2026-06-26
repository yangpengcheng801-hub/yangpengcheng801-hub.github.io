export type ContentType = 'title' | 'text' | 'formula' | 'table' | 'reference'

export interface DocumentChunk {
  chunk_id: string
  chapter_path: string
  content: string
  content_type: ContentType
  position: string
  page_num: number | null
}

export interface PaperKnowledge {
  research_background: string
  core_innovations: string[]
  method_framework: string
  key_formulas: string[]
  datasets: string[]
  metrics: string[]
  experiment_conclusion: string
  limitations: string
  application_scenarios: string
}

export interface KnowledgeResponse {
  knowledge: PaperKnowledge
  truncated: boolean
  input_chars: number
}

export interface ChapterOutline {
  path: string
  title: string
  chunk_id: string
  page_num: number | null
}

export interface PaperSummary {
  paper_id: string
  filename: string
  chunk_count: number
}

export interface SourceItem extends DocumentChunk {}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: SourceItem[]
  pending?: boolean
}

export interface ChapterNode {
  id: string
  title: string
  path: string
  children: ChapterNode[]
}

export interface UploadResponse {
  paper_id: string
  filename: string
  chunk_count: number
  structure: string[]
  outline: ChapterOutline[]
}

export interface ChatApiResponse {
  answer: string
  sources: SourceItem[]
}

export type ReaderMode = 'dashboard' | 'reader'
export type FileKind = 'pdf' | 'docx'

export interface PaperSession {
  paperId: string
  filename: string
}
