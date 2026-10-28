import type { CSSProperties, ReactNode } from 'react'
import { Reveal } from '@/components/motion/Reveal'
import { useSvgId } from '@/hooks/useSvgId'
import { cn } from '@/lib/cn'

/**
 * Layered hills with a distant school, painted in the hero's watercolor style.
 * The front hill is the footer's colour, so the page settles into the footer
 * without a visible seam.
 *
 * Three stacked layers share one viewBox and filter, so together they paint
 * exactly like a single SVG. The far and near layers rise in once, far first;
 * the front hill stays put so the join with the footer is never exposed.
 */
export function ClosingLandscape({ className }: { className?: string }) {
  const filterId = useSvgId('closing')
  const filter = `url(#${filterId})`

  return (
    <div aria-hidden="true" className={cn('relative h-[200px] w-full sm:h-[280px] lg:h-[340px]', className)}>
      <svg width="0" height="0" className="absolute" focusable="false">
        <defs>
          {/*
            Fixed region equal to the original single scene's (its bounding box
            -5%/-20%, +10%/+40%), so every layer filters on the same pixel grid
            and the stack paints exactly like the original SVG.
          */}
          <filter
            id={filterId}
            filterUnits="userSpaceOnUse"
            x="-116"
            y="67.67915649414061"
            width="1672"
            height="387.7076507568359"
          >
            <feTurbulence type="fractalNoise" baseFrequency="0.02 0.05" numOctaves="3" seed="12" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="10" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>

      <RisingLayer rise={14} delay={0}>
        <g filter={filter}>
          <path d="M-40 200C200 150 360 172 520 160C700 146 820 110 1000 128C1180 146 1300 118 1480 138V400H-40Z" className="fill-sage-200" opacity="0.8" />
          <path d="M-40 246C180 208 320 228 480 218C640 208 760 178 920 194C1080 210 1240 188 1480 202V400H-40Z" className="fill-sage-300" opacity="0.85" />

          {/* Distant trees and school on the middle hill */}
          <g className="fill-teal-500" opacity="0.65">
            <ellipse cx="300" cy="214" rx="20" ry="16" />
            <ellipse cx="330" cy="206" rx="26" ry="20" />
            <ellipse cx="1110" cy="196" rx="24" ry="18" />
            <ellipse cx="1140" cy="190" rx="16" ry="13" />
          </g>
          <g transform="translate(880 168)">
            <rect x="0" y="6" width="84" height="22" className="fill-accent-50" />
            <rect x="-3" y="2" width="90" height="5" className="fill-accent-200" />
            {[6, 22, 38, 54, 70].map((x) => (
              <path key={x} d={`M${x} 28V16A4 4 0 0 1 ${x + 8} 16V28Z`} className="fill-teal-700" opacity="0.4" />
            ))}
            <rect x="-3" y="27" width="90" height="3" className="fill-clay-400" />
          </g>

          <path d="M-40 296C220 262 420 288 640 276C860 264 1040 238 1240 260C1340 270 1400 268 1480 266V400H-40Z" className="fill-brand-600" opacity="0.9" />
        </g>
      </RisingLayer>

      <LandscapeSvg>
        <g filter={filter}>
          <path d="M-40 330C260 312 520 334 760 322C1000 310 1220 304 1480 316V400H-40Z" className="fill-brand-900" />
        </g>
      </LandscapeSvg>
    </div>
  )
}

function LandscapeSvg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 1440 360" preserveAspectRatio="xMidYMax slice" className="absolute inset-0 block h-full w-full">
      {children}
    </svg>
  )
}

/** A layer that rises into place once, when the scene first scrolls into view. */
function RisingLayer({ rise, delay, children }: { rise: number; delay: number; children: ReactNode }) {
  return (
    <Reveal
      delay={delay}
      className="absolute inset-0"
      style={{ '--reveal-from': `translate3d(0, ${rise}px, 0)` } as CSSProperties}
    >
      <LandscapeSvg>{children}</LandscapeSvg>
    </Reveal>
  )
}
