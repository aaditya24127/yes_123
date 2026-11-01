import type { CSSProperties, ReactNode } from 'react'
import { ParallaxLayer } from '@/components/motion/ParallaxLayer'
import { cn } from '@/lib/cn'

/*
 * Hand-authored watercolor-style illustration of a village government school.
 * The painterly look comes from SVG filters (wobbly edges, pigment grain, soft
 * washes) applied to simple shapes, so it stays crisp, light and recolourable
 * through the design tokens. Filters are static and render once.
 *
 * The scene is four stacked depth layers (sky, far hills, school grounds, near
 * trees and foliage) that rise in one after another and drift at different
 * parallax rates while scrolling.
 */

const ARCH_COUNT = 6
const ARCH_START = 416
const ARCH_PITCH = 48

interface BotanicalLeafProps {
  x: number
  y: number
  rotate: number
  length: number
  width: number
  className: string
}

function BotanicalLeaf({ x, y, rotate, length, width, className }: BotanicalLeafProps) {
  const half = width / 2
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <path
        d={`M0 0 C${half} ${-length * 0.25} ${half} ${-length * 0.7} 0 ${-length} C${-half} ${-length * 0.7} ${-half} ${-length * 0.25} 0 0Z`}
        className={className}
      />
      <path d={`M0 -4 L0 ${-length + 10}`} className="stroke-brand-950/30" strokeWidth="1.4" fill="none" />
    </g>
  )
}

interface LayerProps {
  /** Parallax lag (px) over the first screen of scrolling; distant layers lag more. */
  shift: number
  /** Entrance travel (px); nearer layers rise from further away. */
  rise: number
  /** Entrance delay (ms). */
  delay: number
  children: ReactNode
}

/**
 * One depth layer of the scene. Every layer is a full-size SVG with the
 * original viewBox, so the stacked result paints exactly like the single SVG
 * it replaced, while each layer can move on its own compositor layer.
 */
function Layer({ shift, rise, delay, children }: LayerProps) {
  return (
    <ParallaxLayer shift={shift} className="absolute inset-0">
      <div className="h-full animate-layer-in" style={{ '--layer-rise': `${rise}px`, animationDelay: `${delay}ms` } as CSSProperties}>
        <svg viewBox="0 0 800 600" aria-hidden="true" className="block h-full w-full">
          {children}
        </svg>
      </div>
    </ParallaxLayer>
  )
}

export function HeroLandscape({ className }: { className?: string }) {
  return (
    <div role="img" aria-labelledby="hero-landscape-title" className={cn('relative aspect-[4/3] w-full', className)}>
      <span id="hero-landscape-title" className="sr-only">
        Watercolor illustration of a village school with a large banyan tree, distant hills and foliage
      </span>

      {/* Shared filter definitions, referenced by every layer below. */}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <defs>
          {/* Wobbly painted edges with pigment granulation. */}
          <filter id="hero-wc" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="3" seed="7" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="10" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="grain" />
            <feColorMatrix in="grain" type="saturate" values="0" result="grainGrey" />
            <feComponentTransfer in="grainGrey" result="grainSoft">
              <feFuncR type="linear" slope="0.4" intercept="0.7" />
              <feFuncG type="linear" slope="0.4" intercept="0.7" />
              <feFuncB type="linear" slope="0.4" intercept="0.7" />
            </feComponentTransfer>
            <feBlend in="wobbly" in2="grainSoft" mode="multiply" result="pigment" />
            <feComposite in="pigment" in2="wobbly" operator="in" />
          </filter>
          {/* Gentler distortion that keeps architecture readable. */}
          <filter id="hero-wc-fine" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="11" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" />
          </filter>
          {/* Wet-on-wet blooms. */}
          <filter id="hero-bleed" x="-30%" y="-30%" width="160%" height="160%">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="5" result="warp" />
            <feDisplacementMap in="SourceGraphic" in2="warp" scale="16" xChannelSelector="R" yChannelSelector="G" result="d" />
            <feGaussianBlur in="d" stdDeviation="2" />
          </filter>
          <filter id="hero-soft" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
      </svg>

      <Layer shift={90} rise={0} delay={150}>
        {/* Sky washes and sun */}
        <g filter="url(#hero-soft)">
          <ellipse cx="560" cy="190" rx="300" ry="160" className="fill-accent-100" opacity="0.8" />
          <ellipse cx="280" cy="250" rx="260" ry="140" className="fill-teal-100" opacity="0.6" />
        </g>
        <circle cx="612" cy="148" r="42" className="fill-accent-200" opacity="0.7" filter="url(#hero-bleed)" />

        {/* Birds */}
        <g className="stroke-brand-900" fill="none" strokeLinecap="round" opacity="0.45">
          <path d="M470 118q6-7 12 0q6-7 12 0" strokeWidth="1.6" />
          <path d="M508 96q4-5 8 0q4-5 8 0" strokeWidth="1.3" />
        </g>

      </Layer>

      <Layer shift={60} rise={10} delay={300}>
        {/* Distant and middle hills */}
        <g filter="url(#hero-wc)">
          <path
            d="M0 290C80 250 160 238 240 262C320 286 370 240 460 222C550 204 630 246 710 228C750 220 780 224 800 230V430H0Z"
            className="fill-sage-200"
            opacity="0.9"
          />
          <path
            d="M0 342C100 302 190 312 290 332C390 352 470 308 570 298C660 289 740 314 800 308V470H0Z"
            className="fill-sage-300"
            opacity="0.85"
          />
        </g>

        {/* Distant tree line */}
        <g filter="url(#hero-bleed)" className="fill-teal-400" opacity="0.5">
          <ellipse cx="40" cy="326" rx="28" ry="18" />
          <ellipse cx="84" cy="318" rx="22" ry="16" />
          <ellipse cx="560" cy="300" rx="22" ry="15" />
          <ellipse cx="604" cy="294" rx="30" ry="20" />
          <ellipse cx="654" cy="300" rx="18" ry="13" />
          <ellipse cx="770" cy="306" rx="26" ry="18" />
        </g>

      </Layer>

      <Layer shift={28} rise={18} delay={450}>
        {/* Ground */}
        <g filter="url(#hero-wc)">
          <path d="M0 410C140 392 290 398 420 404C560 410 690 396 800 400V600H0Z" className="fill-sage-200" opacity="0.75" />
          <path d="M0 476C160 456 330 468 480 476C620 484 720 470 800 474V600H0Z" className="fill-sage-200" opacity="0.7" />
        </g>

        {/* Trees peeking over the school roof */}
        <g filter="url(#hero-wc)">
          <ellipse cx="470" cy="306" rx="36" ry="30" className="fill-teal-500" opacity="0.6" />
          <ellipse cx="528" cy="294" rx="44" ry="36" className="fill-brand-400" opacity="0.6" />
          <ellipse cx="640" cy="302" rx="34" ry="28" className="fill-teal-500" opacity="0.55" />
        </g>

        {/* School */}
        <g filter="url(#hero-wc-fine)">
          {/* Side wing with a terracotta tiled roof */}
          <rect x="348" y="352" width="64" height="64" className="fill-accent-50" />
          <path d="M338 356L380 326L422 356Z" className="fill-clay-400" />
          <path d="M346 350L380 330L414 350" className="stroke-clay-600" strokeWidth="1" fill="none" opacity="0.5" />
          <rect x="367" y="372" width="26" height="30" className="fill-teal-600" opacity="0.75" />
          <path d="M374 372v30M380 372v30M386 372v30" className="stroke-accent-50" strokeWidth="1" opacity="0.7" />

          {/* Main block with arched veranda */}
          <rect x="406" y="338" width="300" height="78" className="fill-accent-50" />
          <rect x="400" y="327" width="312" height="13" className="fill-accent-200" />
          <rect x="406" y="340" width="300" height="5" className="fill-clay-300" opacity="0.55" />
          {Array.from({ length: ARCH_COUNT }, (_, i) => {
            const x = ARCH_START + i * ARCH_PITCH
            return (
              <g key={x}>
                <path d={`M${x} 414V368A15 15 0 0 1 ${x + 30} 368V414Z`} className="fill-teal-800" opacity="0.28" />
                <rect x={x + 8} y={i % 2 === 0 ? 380 : 372} width="14" height={i % 2 === 0 ? 34 : 18} className="fill-teal-600" opacity="0.7" />
              </g>
            )
          })}
          <rect x="400" y="412" width="312" height="8" className="fill-clay-400" />

          {/* Signboard (no text, intentionally generic) */}
          <rect x="508" y="311" width="96" height="17" rx="2" className="fill-brand-700" />
          <rect x="518" y="317" width="76" height="2.5" className="fill-accent-50" opacity="0.8" />
          <rect x="530" y="322" width="52" height="2" className="fill-accent-50" opacity="0.6" />

          {/* Steps */}
          <rect x="532" y="420" width="48" height="5" className="fill-accent-200" />
          <rect x="526" y="425" width="60" height="5" className="fill-accent-100" />

          {/* Flag */}
          <path d="M736 298V436" className="stroke-brand-900" strokeWidth="2" />
          <rect x="737" y="300" width="30" height="6" className="fill-accent-400" />
          <rect x="737" y="306" width="30" height="6" className="fill-surface" />
          <rect x="737" y="312" width="30" height="6" className="fill-brand-500" />
          <circle cx="752" cy="309" r="1.8" className="fill-teal-800" />
          <rect x="728" y="434" width="16" height="6" className="fill-accent-200" />
        </g>

        {/* Boundary wall and gate */}
        <g filter="url(#hero-wc-fine)">
          <rect x="300" y="436" width="214" height="12" className="fill-accent-50" />
          <rect x="300" y="434" width="214" height="3" className="fill-clay-300" />
          <rect x="598" y="436" width="202" height="12" className="fill-accent-50" />
          <rect x="598" y="434" width="202" height="3" className="fill-clay-300" />
          {[300, 356, 412, 468, 648, 704, 760].map((x) => (
            <rect key={x} x={x} y="430" width="8" height="18" className="fill-accent-100" />
          ))}
          <rect x="508" y="420" width="10" height="28" className="fill-clay-300" />
          <rect x="594" y="420" width="10" height="28" className="fill-clay-300" />
        </g>

        {/* Courtyard path */}
        <path
          d="M520 448C502 488 456 532 400 572C374 588 344 598 316 600H576C584 564 590 514 596 448Z"
          className="fill-accent-100"
          opacity="0.95"
          filter="url(#hero-wc)"
        />
        <path
          d="M530 452C514 490 472 532 422 570C400 585 372 595 348 600H516C542 562 568 514 582 452Z"
          className="fill-accent-50"
          opacity="0.55"
          filter="url(#hero-wc)"
        />

        {/* Subtle hand-painted botanical path markers indicating the journey toward the school */}
        <g filter="url(#hero-wc-fine)">
          <ellipse cx="550" cy="466" rx="6.5" ry="3" className="fill-clay-300" opacity="0.7" />
          <circle cx="550" cy="466" r="1.2" className="fill-accent-500/50" />

          <ellipse cx="510" cy="502" rx="7.5" ry="3.5" className="fill-accent-300" opacity="0.65" />
          <circle cx="510" cy="502" r="1.3" className="fill-clay-400/50" />

          <ellipse cx="462" cy="540" rx="8.5" ry="4" className="fill-clay-300" opacity="0.7" />
          <circle cx="462" cy="540" r="1.4" className="fill-accent-500/50" />

          <ellipse cx="410" cy="576" rx="9.5" ry="4.5" className="fill-accent-300" opacity="0.65" />
          <circle cx="410" cy="576" r="1.5" className="fill-clay-400/50" />
        </g>

        {/* Shrubs along the wall */}
        <g filter="url(#hero-wc)" opacity="0.8">
          <ellipse cx="330" cy="448" rx="22" ry="11" className="fill-brand-400" />
          <ellipse cx="388" cy="450" rx="18" ry="10" className="fill-sage-400" />
          <ellipse cx="452" cy="449" rx="20" ry="10" className="fill-brand-400" />
          <ellipse cx="652" cy="449" rx="22" ry="11" className="fill-sage-400" />
          <ellipse cx="712" cy="450" rx="20" ry="10" className="fill-brand-400" />
        </g>

      </Layer>

      <Layer shift={0} rise={28} delay={600}>
        {/* Banyan tree grounded naturally in the courtyard */}
        <ellipse cx="256" cy="458" rx="96" ry="13" className="fill-brand-800" opacity="0.15" filter="url(#hero-soft)" />
        <path d="M236 456C243 404 238 330 250 260L264 260C268 330 262 404 274 456Z" className="fill-accent-700" opacity="0.85" filter="url(#hero-wc)" />
        <g filter="url(#hero-wc)">
          <g className="stroke-accent-700" fill="none" strokeLinecap="round" opacity="0.85">
            <path d="M254 270C232 254 212 244 186 238" strokeWidth="6" />
            <path d="M258 266C282 250 302 242 326 236" strokeWidth="6" />
            <path d="M196 242V456M214 252V456M318 242V456" strokeWidth="1.6" opacity="0.6" />
          </g>
          <ellipse cx="252" cy="208" rx="124" ry="74" className="fill-brand-600" opacity="0.85" />
          <ellipse cx="178" cy="230" rx="72" ry="50" className="fill-brand-500" opacity="0.8" />
          <ellipse cx="326" cy="228" rx="78" ry="52" className="fill-teal-500" opacity="0.75" />
          <ellipse cx="242" cy="168" rx="84" ry="52" className="fill-brand-500" opacity="0.7" />
          <ellipse cx="296" cy="182" rx="62" ry="42" className="fill-sage-400" opacity="0.7" />
          <ellipse cx="200" cy="192" rx="52" ry="34" className="fill-sage-300" opacity="0.65" />
          <ellipse cx="334" cy="254" rx="44" ry="26" className="fill-brand-700" opacity="0.55" />
          <ellipse cx="170" cy="262" rx="50" ry="22" className="fill-brand-700" opacity="0.5" />
        </g>

        {/* Neem tree at the right edge */}
        <g filter="url(#hero-wc)">
          <path d="M780 456C784 410 780 360 788 320L798 320C800 360 796 410 800 456Z" className="fill-accent-700" opacity="0.8" />
          <ellipse cx="792" cy="280" rx="62" ry="68" className="fill-brand-500" opacity="0.8" />
          <ellipse cx="770" cy="250" rx="40" ry="36" className="fill-sage-400" opacity="0.7" />
          <ellipse cx="800" cy="320" rx="50" ry="26" className="fill-brand-700" opacity="0.5" />
        </g>

        {/* Foreground botanical foliage */}
        <g filter="url(#hero-wc)">
          <BotanicalLeaf x={0} y={572} rotate={-62} length={130} width={42} className="fill-sage-400" />
          <BotanicalLeaf x={22} y={606} rotate={-28} length={170} width={52} className="fill-brand-700" />
          <BotanicalLeaf x={66} y={606} rotate={-6} length={196} width={56} className="fill-brand-600" />
          <BotanicalLeaf x={116} y={606} rotate={22} length={146} width={46} className="fill-teal-600" />
          <BotanicalLeaf x={800} y={566} rotate={58} length={116} width={38} className="fill-sage-500" />
          <BotanicalLeaf x={782} y={606} rotate={28} length={172} width={52} className="fill-brand-700" />
          <BotanicalLeaf x={740} y={606} rotate={4} length={134} width={42} className="fill-teal-600" />
        </g>
      </Layer>
    </div>
  )
}
