import { cn } from '@/lib/cn'

interface LogoProps {
  /** Use "light" on deep green backgrounds. */
  tone?: 'dark' | 'light'
  className?: string
}

/** CRP Mentor Copilot wordmark with its leaf emblem. */
export function Logo({ tone = 'dark', className }: LogoProps) {
  const light = tone === 'light'
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/images/crp-mentor-logo-icon.png"
        alt="CRP Mentor Copilot logo"
        width={36}
        height={36}
        className={cn(
          'size-9 shrink-0 select-none object-contain',
          light && 'ring-1 ring-brand-50/20 rounded-[8px]',
        )}
        loading="eager"
        decoding="async"
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-display text-lg font-semibold tracking-tight whitespace-nowrap',
            light ? 'text-surface' : 'text-brand-900',
          )}
        >
          CRP Mentor Copilot
        </span>
        <span className={cn('mt-1 text-[0.65rem] font-medium tracking-[0.18em] uppercase', light ? 'text-brand-100/70' : 'text-muted')}>
          Mentoring intelligence
        </span>
      </span>
    </span>
  )
}
