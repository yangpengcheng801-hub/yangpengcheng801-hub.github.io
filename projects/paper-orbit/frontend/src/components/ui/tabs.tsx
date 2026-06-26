import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cn } from '@/utils'

export const Tabs = TabsPrimitive.Root

const tabPanelClass = 'absolute inset-0 min-h-0 overflow-hidden outline-none data-[state=inactive]:hidden'

export function TabsContent({ className, ...props }: TabsPrimitive.TabsContentProps) {
  return (
    <TabsPrimitive.Content
      className={cn(tabPanelClass, className)}
      {...props}
    />
  )
}

export function TabsList({ className, ...props }: TabsPrimitive.TabsListProps) {
  return <TabsPrimitive.List className={cn('flex rounded-xl border border-white/10 bg-black/15 p-1', className)} {...props} />
}

export function TabsTrigger({ className, ...props }: TabsPrimitive.TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      className={cn('flex-1 rounded-lg px-3 py-2 text-xs text-slate-500 transition data-[state=active]:bg-blue-500/15 data-[state=active]:text-blue-300', className)}
      {...props}
    />
  )
}
