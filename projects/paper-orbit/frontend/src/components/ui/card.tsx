import type { HTMLAttributes } from 'react'
import { cn } from '@/utils'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass-panel rounded-2xl', className)} {...props} />
}

