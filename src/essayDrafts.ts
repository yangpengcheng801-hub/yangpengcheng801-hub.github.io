export type EssayDraft = {
  id: string
  text: string
  updatedAt: string
}

const DRAFT_KEY = 'cet4_essay_drafts_v1'
const TEMPLATE_FILL_KEY = 'cet4_template_fill_v1'

function readMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeMap(key: string, value: Record<string, string>) {
  localStorage.setItem(key, JSON.stringify(value))
}

export function readEssayDraft(id: string): string {
  return readMap(DRAFT_KEY)[id] ?? ''
}

export function saveEssayDraft(id: string, text: string): EssayDraft {
  const data = readMap(DRAFT_KEY)
  data[id] = text
  writeMap(DRAFT_KEY, data)
  return { id, text, updatedAt: new Date().toISOString() }
}

export function clearEssayDraft(id: string) {
  const data = readMap(DRAFT_KEY)
  delete data[id]
  writeMap(DRAFT_KEY, data)
}

export function readTemplateFill(templateId: string): string[] {
  try {
    const data = readMap(TEMPLATE_FILL_KEY)
    const raw = data[templateId]
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveTemplateFill(templateId: string, values: string[]) {
  const data = readMap(TEMPLATE_FILL_KEY)
  data[templateId] = JSON.stringify(values)
  writeMap(TEMPLATE_FILL_KEY, data)
}
