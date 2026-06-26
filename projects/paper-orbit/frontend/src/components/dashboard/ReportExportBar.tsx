import { Download, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePaperStore } from '@/store/paperStore'
import { buildReportMarkdown, downloadMarkdown, printReportAsPdf } from '@/utils/exportReport'

export function ReportExportBar() {
  const filename = usePaperStore((state) => state.filename)
  const knowledge = usePaperStore((state) => state.knowledge)
  if (!knowledge) return null

  const markdown = buildReportMarkdown(filename, knowledge)

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      <Button
        variant="glass"
        size="sm"
        onClick={() => downloadMarkdown(filename, markdown)}
      >
        <Download className="mr-1 size-3.5" />
        导出 Markdown
      </Button>
      <Button
        variant="glass"
        size="sm"
        onClick={() => printReportAsPdf(filename.replace(/\.(pdf|docx)$/i, ''), markdown)}
      >
        <FileText className="mr-1 size-3.5" />
        导出 PDF
      </Button>
    </div>
  )
}
