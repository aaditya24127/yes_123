import { useSvgId } from '@/hooks/useSvgId'
import { cn } from '@/lib/cn'

interface WashBackdropProps {
  /** A Tailwind fill utility for the wash colour. */
  fillClass: string
  className?: string
}

/**
 * A soft watercolor wash behind a section's content: an organic, slightly
 * blurred shape rather than a rectangular band. Place inside a relative parent.
 */
export function WashBackdrop({ fillClass, className }: WashBackdropProps) {
  const filterId = useSvgId('wash')
  return (
    <svg
      viewBox="0 0 1000 600"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 -z-10 h-full w-full', fillClass, className)}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="3" seed="9" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="40" xChannelSelector="R" yChannelSelector="G" result="d" />
          <feGaussianBlur in="d" stdDeviation="6" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path d="M40 60C260 20 700 40 960 70C990 220 985 420 955 545C700 580 300 585 45 550C15 400 20 200 40 60Z" opacity="0.55" />
        <path d="M120 110C360 80 680 90 900 120C920 260 915 400 890 500C660 525 340 530 110 505C90 380 95 230 120 110Z" opacity="0.5" />
      </g>
    </svg>
  )
}
