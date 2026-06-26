import type { ReactNode } from 'react'
import { BookOpen, ListTree, NotebookPen, Route } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChapterOutline } from '@/components/layout/ChapterOutline'
import { NotesPanel } from '@/components/layout/NotesPanel'
import { ReadingInsights } from '@/components/layout/ReadingInsights'
import { ReadingWorkflow } from '@/components/layout/ReadingWorkflow'

function SidebarPanel({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div
      data-testid={testId}
      className="panel-scroll h-full min-h-0 overflow-y-auto overscroll-y-contain"
    >
      {children}
    </div>
  )
}

export function Sidebar() {
  return (
    <aside className="glass-panel flex h-full min-h-0 flex-col overflow-hidden rounded-2xl">
      <Tabs defaultValue="outline" className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="shrink-0 p-3">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-1">
            <TabsTrigger value="outline"><ListTree className="mr-1 inline size-3" />章节</TabsTrigger>
            <TabsTrigger value="insights"><BookOpen className="mr-1 inline size-3" />要点</TabsTrigger>
            <TabsTrigger value="workflow"><Route className="mr-1 inline size-3" />阅读</TabsTrigger>
            <TabsTrigger value="notes"><NotebookPen className="mr-1 inline size-3" />笔记</TabsTrigger>
          </TabsList>
        </div>
        <div className="relative min-h-0 flex-1">
          <TabsContent value="outline">
            <SidebarPanel testId="chapter-scroll-container">
              <ChapterOutline />
            </SidebarPanel>
          </TabsContent>
          <TabsContent value="insights">
            <SidebarPanel testId="insights-scroll-container">
              <ReadingInsights />
            </SidebarPanel>
          </TabsContent>
          <TabsContent value="workflow">
            <SidebarPanel testId="workflow-scroll-container">
              <ReadingWorkflow />
            </SidebarPanel>
          </TabsContent>
          <TabsContent value="notes" className="flex flex-col">
            <NotesPanel />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  )
}
