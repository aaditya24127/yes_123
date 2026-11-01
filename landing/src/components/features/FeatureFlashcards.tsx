import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { FallingLeaves } from '@/components/motion/FallingLeaves'
import { featureLeaves } from '@/components/motion/leafPresets'
import { Reveal } from '@/components/motion/Reveal'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Flashcard, type FlashcardProps } from './Flashcard'
import {
  GapsPreview,
  PrioritiesPreview,
  ProgressPreview,
  RecommendationPreview,
  VisitPlanPreview,
} from './FlashcardPreviews'

type CardConfig = Omit<FlashcardProps, 'index' | 'dynamicSway'>

const cards: CardConfig[] = [
  {
    title: 'School Priorities',
    description: 'See which schools need support first, and why.',
    surfaceClass: 'bg-surface',
    tilt: 2.2,
    flexClass: 'xl:flex-[1_1_0%]',
    badge: 'Sample',
    preview: <PrioritiesPreview />,
  },
  {
    title: 'Learning Gaps',
    description: 'Spot where learners are struggling, grade by grade.',
    surfaceClass: 'bg-sage-100',
    tilt: -1.6,
    flexClass: 'xl:flex-[1.12_1_0%]',
    badge: 'Sample',
    preview: <GapsPreview />,
  },
  {
    title: 'Mentoring Recommendations',
    description: 'Get a practical next step to talk through with each teacher.',
    surfaceClass: 'bg-teal-100',
    tilt: 1.0,
    flexClass: 'xl:flex-[1_1_0%]',
    badge: 'Sample',
    preview: <RecommendationPreview />,
  },
  {
    title: 'Visit Planning',
    description: 'Plan focused visits with a clear purpose and a follow-up date.',
    surfaceClass: 'bg-clay-50',
    tilt: -2.0,
    flexClass: 'xl:flex-[1.08_1_0%]',
    badge: 'Sample',
    preview: <VisitPlanPreview />,
  },
  {
    title: 'Progress Tracking',
    description: 'Look back at what changed between one visit and the next.',
    surfaceClass: 'bg-accent-50',
    tilt: -2.8,
    flexClass: 'xl:flex-[0.98_1_0%]',
    badge: 'Illustrative',
    preview: <ProgressPreview />,
  },
]

/**
 * Interactive clothesline feature flashcards:
 * The rope, clothespins, and paper cards move together as one connected system.
 * On desktop, moving the cursor across the section produces smooth, bounded
 * horizontal movement with gentle spring-like card sway.
 * On mobile and with reduced motion, it remains a stable, responsive layout.
 */
export function FeatureFlashcards() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [shift, setShift] = useState(0)
  const [sway, setSway] = useState(0)

  const targetShiftRef = useRef(0)
  const currentShiftRef = useRef(0)
  const currentSwayRef = useRef(0)
  const animFrameRef = useRef<number | null>(null)
  const isInteractingRef = useRef(false)

  useEffect(() => {
    // Respect prefers-reduced-motion and touch-only devices
    const mediaReduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const mediaPointer = window.matchMedia('(hover: hover) and (pointer: fine)')

    if (mediaReduced.matches || !mediaPointer.matches) {
      return
    }

    const container = containerRef.current
    if (!container) return

    const handlePointerMove = (e: PointerEvent) => {
      isInteractingRef.current = true
      const rect = container.getBoundingClientRect()
      // Normalize cursor X from -1 to 1 across the section width
      const normX = Math.max(-1, Math.min(1, ((e.clientX - rect.left) / rect.width) * 2 - 1))
      // Bounded horizontal displacement (max ±42px)
      targetShiftRef.current = normX * -42
    }

    const handlePointerLeave = () => {
      targetShiftRef.current = 0
    }

    const updatePhysics = () => {
      const diff = targetShiftRef.current - currentShiftRef.current
      if (Math.abs(diff) > 0.05 || Math.abs(currentSwayRef.current) > 0.02) {
        currentShiftRef.current += diff * 0.08
        // Card sway proportional to motion velocity
        const targetSway = diff * 0.05
        currentSwayRef.current += (targetSway - currentSwayRef.current) * 0.12
        setShift(Number(currentShiftRef.current.toFixed(2)))
        setSway(Number(currentSwayRef.current.toFixed(2)))
      }
      animFrameRef.current = requestAnimationFrame(updatePhysics)
    }

    animFrameRef.current = requestAnimationFrame(updatePhysics)
    container.addEventListener('pointermove', handlePointerMove, { passive: true })
    container.addEventListener('pointerleave', handlePointerLeave)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      container.removeEventListener('pointermove', handlePointerMove)
      container.removeEventListener('pointerleave', handlePointerLeave)
    }
  }, [])

  return (
    <section id="features" aria-labelledby="features-title" className="pin-timeline relative isolate pin:h-[140vh]">
      <FallingLeaves leaves={featureLeaves} className="-z-10" />

      <div className="py-12 sm:py-16 lg:py-20 pin:sticky pin:top-0 pin:flex pin:min-h-svh pin:flex-col pin:justify-center pin:py-10">
        <Container className="max-w-wide">
          <SectionHeading
            id="features-title"
            eyebrow="What the Copilot surfaces"
            title={
              <>
                Small insights. <em className="font-normal text-teal-600">Meaningful change.</em>
              </>
            }
          />

          <Reveal variant="fade" className="relative mt-14 pb-6 xl:mt-14 pin:mt-10">
            {/* Unified interactive clothesline track */}
            <div
              ref={containerRef}
              className="relative transition-transform duration-75 ease-out select-none"
              style={
                {
                  transform: `translate3d(${shift}px, 0, 0)`,
                  willChange: shift !== 0 ? 'transform' : 'auto',
                } as CSSProperties
              }
            >
              {/* Full-width continuous clothesline rope on wide screens */}
              <div
                aria-hidden="true"
                className="clothesline-rope absolute -inset-x-6 top-[15px] hidden h-[3px] rounded-full shadow-[0_2px_4px_rgb(60_48_30/0.18)] xl:block"
              >
                {/* Decorative wooden anchor pegs at line ends */}
                <span className="absolute -left-1.5 -top-1 size-2.5 rounded-full bg-accent-700 shadow-sm" />
                <span className="absolute -right-1.5 -top-1 size-2.5 rounded-full bg-accent-700 shadow-sm" />
              </div>

              {/* Connected cards hanging from the rope */}
              <ul
                className="pin-drift grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3 xl:flex xl:items-start xl:gap-5"
                aria-label="Feature previews"
              >
                {cards.map((card, index) => (
                  <Flashcard
                    key={card.title}
                    index={index}
                    dynamicSway={sway * (index % 2 === 0 ? 1 : 0.8)}
                    {...card}
                  />
                ))}
              </ul>
            </div>
          </Reveal>
        </Container>
      </div>
    </section>
  )
}

