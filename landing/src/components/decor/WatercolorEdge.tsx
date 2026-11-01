import { useSvgId } from '@/hooks/useSvgId'
import { cn } from '@/lib/cn'

interface WatercolorEdgeProps {
  /** Which edge of the parent section the band sits on. */
  position: 'top' | 'bottom'
  /** A Tailwind fill utility matching the section background. */
  fillClass: string
}

/**
 * An irregular, painted edge that lets a coloured section bleed into the
 * paper around it instead of ending on a hard line. Place inside a relative parent.
 */
export function WatercolorEdge({ position, fillClass }: WatercolorEdgeProps) {
  const filterId = useSvgId('edge')
  return (
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute inset-x-0 h-12 w-full sm:h-16',
        position === 'top' ? 'bottom-full -mb-px' : 'top-full -mt-px -scale-y-100',
        fillClass,
      )}
    >
      <defs>
        <filter id={filterId} x="-5%" y="-40%" width="110%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.09" numOctaves="3" seed="4" result="warp" />
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="16" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${filterId})`}>
        <path
          d="M0 90V44C120 28 240 56 380 42C520 28 640 10 800 24C960 38 1100 56 1240 38C1330 26 1400 28 1440 32V90Z"
          opacity="0.4"
        />
        <path d="M0 90V58C160 44 300 66 460 54C620 42 760 30 920 42C1080 54 1220 66 1440 50V90Z" />
      </g>
    </svg>
  )
}
