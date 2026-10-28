import type { CSSProperties } from 'react'
import { PATH_MILESTONES } from '@/components/motion/timing'
import { useSvgId } from '@/hooks/useSvgId'
import { mentoringTimeline } from '@/data/sampleData'

const WIDTH = 1000
const HEIGHT = 220
const TOP = 24
const BOTTOM = 196

// Points sit at the timeline's column centres so dots line up with the steps below (md+).
const points = mentoringTimeline.map((entry, index) => ({
  x: ((index + 0.5) / mentoringTimeline.length) * WIDTH,
  y: BOTTOM - entry.level * (BOTTOM - TOP),
}))

function smoothPath(): string {
  const [first, ...rest] = points
  let d = `M0 ${first.y + 12}C${first.x * 0.5} ${first.y + 12} ${first.x * 0.5} ${first.y} ${first.x} ${first.y}`
  let previous = first
  for (const point of rest) {
    const mid = (previous.x + point.x) / 2
    d += `C${mid} ${previous.y} ${mid} ${point.y} ${point.x} ${point.y}`
    previous = point
  }
  return `${d}C${previous.x + 60} ${previous.y} ${WIDTH - 40} ${previous.y - 14} ${WIDTH} ${previous.y - 18}`
}

const LINE = smoothPath()
const AREA = `${LINE}V${HEIGHT}H0Z`

const bands = ['Secure', 'Developing', 'Beginning']

/**
 * Illustrative progress curve across one mentoring cycle. Qualitative bands
 * only, no figures: it shows the shape of a story, not measured results.
 */
export function ProgressCurve() {
  const gradientId = useSvgId('curve')
  return (
    <figure className="relative">
      <div className="relative h-44 sm:h-52">
        {/* Qualitative bands */}
        <div className="absolute inset-0 flex flex-col" aria-hidden="true">
          {bands.map((band) => (
            <div key={band} className="flex flex-1 items-start border-t border-dashed border-brand-50/12">
              <span className="hidden pt-1 text-[0.65rem] font-medium tracking-wider text-brand-100/50 uppercase md:inline">
                {band}
              </span>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--color-teal-300)" stopOpacity="0.45" />
              <stop offset="1" stopColor="var(--color-teal-300)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={AREA}
            fill={`url(#${gradientId})`}
            className="opacity-0 transition-opacity delay-[1200ms] duration-[1500ms] [[data-inview]_&]:opacity-100"
          />
          <path
            d={LINE}
            pathLength={1}
            className="draw-path fill-none stroke-accent-300"
            strokeWidth="3"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* HTML dots keep their shape however the chart stretches; each pops in as the line reaches it. */}
        {points.map((point, index) => (
          <span
            key={point.x}
            aria-hidden="true"
            className="pop-in absolute flex size-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-accent-300 font-display text-sm font-semibold text-brand-950 shadow-[0_0_0_6px_rgb(26_51_38/0.6)]"
            style={
              {
                left: `${(point.x / WIDTH) * 100}%`,
                top: `${(point.y / HEIGHT) * 100}%`,
                '--pop-delay': `${PATH_MILESTONES[index]}ms`,
              } as CSSProperties
            }
          >
            {index + 1}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[0.65rem] font-medium tracking-wider text-brand-100/50 uppercase md:hidden" aria-hidden="true">
        Low: beginning · Middle: developing · High: secure
      </p>
      <figcaption className="mt-3 text-xs text-brand-100/60">
        Illustrative example of one mentoring cycle. Qualitative stages only; not real or measured results.
      </figcaption>
    </figure>
  )
}
