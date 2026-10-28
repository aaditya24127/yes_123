import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Tone = 'clay' | 'accent' | 'sage' | 'teal' | 'brand'

const toneClasses: Record<Tone, string> = {
  clay: 'bg-clay-100 text-clay-700',
  accent: 'bg-accent-100 text-accent-700',
  sage: 'bg-sage-100 text-sage-700',
  teal: 'bg-teal-100 text-teal-700',
  brand: 'bg-brand-100 text-brand-800',
}

/** A small rounded status label. */
export function Pill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', toneClasses[tone], className)}>
      {children}
    </span>
  )
}
