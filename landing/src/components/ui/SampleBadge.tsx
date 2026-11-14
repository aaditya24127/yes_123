import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface SampleBadgeProps {
  children?: ReactNode
  /** Use "dark" on deep green backgrounds. */
  tone?: 'light' | 'dark'
  className?: string
}

/** Marks demonstration content as sample or illustrative. */
export function SampleBadge({ children = 'Sample data', tone = 'light', className }: SampleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold tracking-wider uppercase',
        tone === 'light' ? 'bg-accent-100 text-accent-700' : 'bg-accent-300/15 text-accent-200',
        className,
      )}
    >
      {children}
    </span>
  )
}
