import type { CSSProperties } from 'react'
import { CalendarCheck, FolderOpen, ListChecks, ScanSearch, type LucideIcon } from 'lucide-react'
import { FernSprig } from '@/components/decor/FernSprig'
import { FallingLeaves } from '@/components/motion/FallingLeaves'
import { processLeaves } from '@/components/motion/leafPresets'
import { Reveal } from '@/components/motion/Reveal'
import { PATH_MILESTONES } from '@/components/motion/timing'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { cn } from '@/lib/cn'

interface Step {
  icon: LucideIcon
  title: string
  text: string
}

const steps: Step[] = [
  {
    icon: FolderOpen,
    title: 'Bring school records together',
    text: 'Assessment records, observation notes and visit history for each school, gathered in one place.',
  },
  {
    icon: ScanSearch,
    title: 'Review evidence and identify learning needs',
    text: 'See where learners are struggling and what the evidence says, grade by grade.',
  },
  {
    icon: ListChecks,
    title: 'Prioritise mentoring and choose practical actions',
    text: 'Decide which schools need support first, and pick classroom actions teachers can use right away.',
  },
  {
    icon: CalendarCheck,
    title: 'Track follow-ups and review progress',
    text: "Plan the next visit, note what changed, and keep each school's story moving forward.",
  },
]

/*
 * Desktop footpath geometry: a 1000 × 240 box stretched to the row's width.
 * Markers sit at the column centres (12.5%, 37.5%…) and alternate between
 * y = 40 and y = 136, which match the markers' CSS offsets below.
 */
const PATH =
  'M-20 76C40 76 70 40 125 40C220 40 280 136 375 136C470 136 530 40 625 40C720 40 780 136 875 136C930 136 970 116 1020 104'

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-it-works-title" className="relative isolate py-12 sm:py-16 lg:py-20">
      <FallingLeaves leaves={processLeaves} className="-z-10" />
      <FernSprig className="absolute top-10 right-4 -z-10 w-28 -scale-x-100 text-sage-300/70 sm:right-10 lg:w-36" />

      <Container className="max-w-wide">
        <SectionHeading
          id="how-it-works-title"
          eyebrow="How it works"
          title={
            <>
              From scattered records to <em className="font-normal text-teal-600">focused visits</em>.
            </>
          }
          align="center"
        />

        <Reveal variant="fade" className="relative mt-16 lg:mt-20">
          {/* Winding footpath that draws itself in (desktop). */}
          <svg
            viewBox="0 0 1000 240"
            preserveAspectRatio="none"
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 hidden h-[240px] w-full overflow-visible lg:block"
          >
            <path
              d={PATH}
              pathLength={1}
              className="draw-path fill-none stroke-sage-200"
              strokeWidth="26"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              opacity="0.8"
            />
            <path
              d={PATH}
              pathLength={1}
              className="fill-none stroke-accent-500/60 opacity-0 transition-opacity delay-[1800ms] duration-1000 [[data-inview]_&]:opacity-100"
              strokeWidth="2.5"
              strokeDasharray="0.002 0.011"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Mobile and tablet: a vertical trail behind the markers. */}
          <div
            aria-hidden="true"
            className="absolute top-10 bottom-10 left-[39px] w-5 -translate-x-1/2 rounded-full bg-sage-200/70 lg:hidden"
          >
            <div className="mx-auto h-full w-0.5 bg-[repeating-linear-gradient(to_bottom,rgb(184_133_45/0.6)_0_3px,transparent_3px_11px)]" />
          </div>

          <ol className="relative grid gap-12 lg:grid-cols-4 lg:gap-8">
            {steps.map((step, index) => (
              // Desktop: each step lands as the drawn path reaches its marker. Stacked: as it scrolls into view.
              <Reveal
                as="li"
                key={step.title}
                className={cn(
                  'flex gap-6 lg:flex-col lg:items-center lg:gap-0 lg:text-center',
                  '[--pop-delay:120ms] [--reveal-delay:0ms] lg:[--pop-delay:var(--milestone)] lg:[--reveal-delay:var(--milestone)]',
                  index % 2 === 1 && 'lg:pt-24',
                )}
                style={{ '--milestone': `${PATH_MILESTONES[index]}ms` } as CSSProperties}
              >
                <StepMarker icon={step.icon} number={index + 1} />
                <div className="pt-3 lg:mt-6 lg:max-w-[16rem] lg:pt-0">
                  <h3 className="text-xl leading-snug font-medium text-brand-950 sm:text-[1.35rem]">{step.title}</h3>
                  <p className="mt-2 text-base leading-relaxed text-muted">{step.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  )
}

function StepMarker({ icon: Icon, number }: { icon: LucideIcon; number: number }) {
  return (
    <div className="pop-in relative flex size-20 shrink-0 items-center justify-center rounded-full bg-surface shadow-card ring-[6px] ring-sage-100">
      <Icon className="size-7 text-brand-700" aria-hidden="true" />
      <span className="absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-accent-300 font-display text-sm font-semibold text-brand-950">
        <span className="sr-only">Step </span>
        {number}
      </span>
    </div>
  )
}
