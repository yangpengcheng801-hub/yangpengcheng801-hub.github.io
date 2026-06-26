const NOTES_PREFIX = 'paper-orbit-notes:'

export function loadPaperNotes(paperId: string): string {
  try {
    return localStorage.getItem(`${NOTES_PREFIX}${paperId}`) ?? ''
  } catch {
    return ''
  }
}

export function savePaperNotes(paperId: string, content: string): void {
  localStorage.setItem(`${NOTES_PREFIX}${paperId}`, content)
}

export interface ReadingTemplate {
  id: string
  title: string
  description: string
  prompt: string
}

export const READING_TEMPLATES: ReadingTemplate[] = [
  {
    id: 'seven-1',
    title: '七问 · 研究问题',
    description: '这篇论文要解决什么问题？',
    prompt: '请用七问阅读法的第一问回答：这篇论文的核心研究问题是什么？背景动机是什么？',
  },
  {
    id: 'seven-2',
    title: '七问 · 核心创新',
    description: '最重要的贡献是什么？',
    prompt: '请用七问阅读法回答：这篇论文的核心创新点和方法贡献是什么？',
  },
  {
    id: 'seven-3',
    title: '七问 · 实验结论',
    description: '实验证明了什么？',
    prompt: '请用七问阅读法回答：论文实验设置、关键指标和结论是什么？',
  },
  {
    id: 'pass-1',
    title: '三遍 · 找战场',
    description: '快速判断值不值得细读',
    prompt: '请用三遍阅读法的第一遍“找战场”：这篇论文研究什么现象、用了什么理论工具、核心贡献是什么？',
  },
  {
    id: 'pass-2',
    title: '三遍 · 拆地图',
    description: '梳理论证结构',
    prompt: '请用三遍阅读法的第二遍“拆地图”：梳理论文的研究问题、文献综述、方法设计和实验安排。',
  },
  {
    id: 'pass-3',
    title: '三遍 · 画连接',
    description: '评价意义与局限',
    prompt: '请用三遍阅读法的第三遍“画连接”：评价论文的方法优缺点、理论对话、研究意义和局限。',
  },
]
