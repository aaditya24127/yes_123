import type { ReactNode } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { cn } from '@/lib/cn'

interface SectionHeadingProps {
  id: string
  eyebrow: string
  title: ReactNode
  description?: ReactNode
  align?: 'left' | 'center'
  /** Use "dark" on deep green backgrounds. */
  tone?: 'light' | 'dark'
  className?: string
}

/** Eyebrow, editorial headline and supporting copy, revealed on scroll. */
export function SectionHeading({ id, eyebrow, title, description, align = 'left', tone = 'light', className }: SectionHeadingProps) {
  const dark = tone === 'dark'
  return (
    <Reveal as="header" className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      <p
        className={cn(
          'inline-flex items-center gap-3 text-xs font-semibold tracking-[0.2em] uppercase',
          dark ? 'text-accent-200' : 'text-teal-600',
        )}
      >
        <span className="h-px w-8 bg-current opacity-60" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2
        id={id}
        className={cn(
          'mt-4 text-[2.25rem] leading-[1.08] font-medium sm:text-5xl lg:text-[3.25rem]',
          dark ? 'text-surface' : 'text-brand-950',
        )}
      >
        {title}
      </h2>
      {description && (
        <p className={cn('mt-5 text-lg leading-relaxed', dark ? 'text-brand-100/80' : 'text-muted')}>{description}</p>
      )}
    </Reveal>
  )
}
