import type { PaperKnowledge } from '@/types'

export function buildReportMarkdown(filename: string, knowledge: PaperKnowledge): string {
  const lines = [
    `# ${filename.replace(/\.(pdf|docx)$/i, '')}`,
    '',
    '> Paper Orbit 速读报告',
    '',
    '## 研究背景',
    knowledge.research_background,
    '',
    '## 核心创新',
    ...knowledge.core_innovations.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## 方法框架',
    knowledge.method_framework,
    '',
    '## 关键公式',
    ...(knowledge.key_formulas.length ? knowledge.key_formulas.map((item) => `- ${item}`) : ['- 原文未说明']),
    '',
    '## 实验数据与指标',
    `数据集：${knowledge.datasets.join('；') || '原文未说明'}`,
    `指标：${knowledge.metrics.join('；') || '原文未说明'}`,
    '',
    '## 核心结论',
    knowledge.experiment_conclusion,
    '',
    '## 研究局限',
    knowledge.limitations,
    '',
    '## 适用场景',
    knowledge.application_scenarios,
    '',
  ]
  return lines.join('\n')
}

export function downloadMarkdown(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${filename.replace(/\.(pdf|docx)$/i, '')}-速读报告.md`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function printReportAsPdf(title: string, markdown: string): void {
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=900,height=700')
  if (!popup) return
  const html = markdown
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^- (.*)$/gm, '<li>$1</li>')
    .replace(/^\d+\. (.*)$/gm, '<li>$1</li>')
    .replace(/\n{2,}/g, '</p><p>')
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>body{font-family:Georgia,serif;max-width:760px;margin:40px auto;line-height:1.7;color:#111}
    h1{font-size:28px} h2{margin-top:28px;font-size:20px} li{margin:6px 0}</style></head>
    <body><p>${html}</p><script>window.onload=()=>window.print()</script></body></html>`)
  popup.document.close()
}
