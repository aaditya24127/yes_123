import { useId, type CSSProperties, type ReactNode } from 'react'
import { Clip } from '@/components/decor/Clip'
import { Reveal } from '@/components/motion/Reveal'
import { STAGGER, THREAD_LEAD } from '@/components/motion/timing'
import { SampleBadge } from '@/components/ui/SampleBadge'
import { cn } from '@/lib/cn'

export interface FlashcardProps {
  index: number
  title: string
  description: string
  /** Background utility for the print's paper. */
  surfaceClass: string
  /** Resting rotation in degrees. */
  tilt: number
  /** Relative width on the single wide row (xl), as a flex utility. */
  flexClass: string
  badge: string
  preview: ReactNode
  /** Dynamic sway from cursor motion */
  dynamicSway?: number
}

/**
 * A feature card visibly pinned to a clothesline rope with a wooden clothespin.
 * Connects directly to the line, with natural paper texture, subtle shadow,
 * and realistic sway dynamics.
 */
export function Flashcard({
  index,
  title,
  description,
  surfaceClass,
  tilt,
  flexClass,
  badge,
  preview,
  dynamicSway = 0,
}: FlashcardProps) {
  const titleId = useId()
  const descriptionId = useId()

  const timing = {
    '--card-delay': `${(index % 3) * STAGGER}ms`,
    '--card-delay-wide': `${THREAD_LEAD + index * STAGGER}ms`,
    '--settle-rotate': `${tilt > 0 ? -2.5 : 2.5}deg`,
    '--base-tilt': `${tilt}deg`,
    '--active-tilt': `${tilt}deg`,
    '--dynamic-sway': `${dynamicSway}deg`,
  } as CSSProperties

  return (
    <li
      className={cn(
        'group relative mx-auto w-full max-w-[18.5rem] pt-3 sm:max-w-none xl:mx-0',
        'z-10 transition-[z-index] hover:z-30 focus-within:z-30',
        flexClass,
      )}
      style={timing}
    >
      {/* Individual rope segment for wrapped rows on screens below xl */}
      <div
        aria-hidden="true"
        className="clothesline-rope absolute -inset-x-3 top-3 h-[3px] rounded-full shadow-[0_2px_3px_rgb(60_48_30/0.14)] xl:hidden"
      />

      <Reveal variant="settle" className="[--reveal-delay:var(--card-delay)] xl:[--reveal-delay:var(--card-delay-wide)]">
        {/*
          Unified hanging unit: clip and paper card move together as one physical piece.
          On hover or keyboard focus, it rises slightly (-10px), scales subtly (1.038),
          and softens its tilt with a spring-like settle.
        */}
        <div
          className={cn(
            'relative pt-3 origin-top',
            'transition-[transform,filter] duration-500 ease-spring',
            'group-hover:[transform:translate3d(0,-10px,0)_scale(1.038)]',
            'group-hover:[--active-tilt:calc(var(--base-tilt)*0.35)]',
            'group-focus-within:[transform:translate3d(0,-10px,0)_scale(1.038)]',
            'group-focus-within:[--active-tilt:calc(var(--base-tilt)*0.35)]',
            'motion-reduce:transform-none motion-reduce:transition-none',
          )}
        >
          {/* Wooden clip directly clamping card to the clothesline */}
          <div className="pointer-events-none absolute -top-1 left-1/2 z-20 -translate-x-1/2">
            <Clip className="h-9 w-4.5 drop-shadow-[0_2px_3px_rgb(60_48_30/0.3)] transition-transform duration-500 ease-spring group-hover:scale-105 group-focus-within:scale-105" />
          </div>

          <article
            tabIndex={0}
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            className={cn(
              'paper-grain relative rounded-[1.1rem] p-2.5 pb-5 outline-offset-4',
              'origin-top shadow-print transition-[box-shadow,transform] duration-500 ease-spring',
              'group-hover:shadow-print-lifted group-focus-within:shadow-print-lifted',
              'focus-visible:ring-2 focus-visible:ring-brand-700/60 focus-visible:outline-none',
              surfaceClass,
            )}
            style={{
              transform: `rotate(calc(var(--active-tilt) + var(--dynamic-sway)))`,
            }}
          >
            <div className="h-40 overflow-hidden rounded-[0.8rem] border border-brand-950/5 bg-background/70">{preview}</div>

            <div className="px-1.5 pt-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm text-accent-600 italic">No. {String(index + 1).padStart(2, '0')}</span>
                <SampleBadge>{badge}</SampleBadge>
              </div>
              <h3 id={titleId} className="mt-1.5 text-xl leading-tight font-medium text-brand-950">
                {title}
              </h3>
              <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted">
                {description}
              </p>
            </div>
          </article>
        </div>
      </Reveal>
    </li>
  )
}

