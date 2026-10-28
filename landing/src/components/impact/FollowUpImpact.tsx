import type { CSSProperties } from 'react'
import { FernSprig } from '@/components/decor/FernSprig'
import { WatercolorEdge } from '@/components/decor/WatercolorEdge'
import { FallingLeaves } from '@/components/motion/FallingLeaves'
import { impactLeaves } from '@/components/motion/leafPresets'
import { Reveal } from '@/components/motion/Reveal'
import { PATH_MILESTONES, STAGGER } from '@/components/motion/timing'
import { Container } from '@/components/ui/Container'
import { SampleBadge } from '@/components/ui/SampleBadge'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { mentoringTimeline } from '@/data/sampleData'
import { ProgressCurve } from './ProgressCurve'

export function FollowUpImpact() {
  return (
    <section
      id="follow-up"
      aria-labelledby="follow-up-title"
      className="relative isolate my-10 bg-brand-900 py-16 text-brand-50 sm:my-14 sm:py-20 lg:my-16 lg:py-24"
    >
      <WatercolorEdge position="top" fillClass="fill-brand-900" />
      <WatercolorEdge position="bottom" fillClass="fill-brand-900" />
      <FallingLeaves leaves={impactLeaves} className="-z-10" />
      <FernSprig className="absolute top-6 right-0 -z-10 w-36 -scale-x-100 text-brand-50/8 sm:w-48" />
      <FernSprig className="absolute bottom-4 left-0 -z-10 w-32 text-brand-50/8 sm:w-44" />

      <Container className="max-w-wide">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            id="follow-up-title"
            tone="dark"
            eyebrow="Follow-up and progress"
            title={
              <>
                Progress, <em className="font-normal text-accent-200">one visit at a time</em>.
              </>
            }
            description="Follow-ups turn advice into a shared story of change. Here is how one illustrative mentoring cycle might unfold."
          />
          <SampleBadge tone="dark" className="self-start lg:self-end">
            Illustrative example
          </SampleBadge>
        </div>

        <Reveal variant="fade" className="mt-14 lg:mt-16">
          <ProgressCurve />

          <ol className="mt-10 grid gap-8 sm:grid-cols-2 md:mt-12 md:grid-cols-4 md:gap-6">
            {mentoringTimeline.map((entry, index) => (
              // In columns, each step follows its milestone dot on the curve; stacked, it enters as it scrolls in.
              <Reveal
                as="li"
                key={entry.title}
                className="relative [--reveal-delay:var(--stacked-delay)] md:text-center md:[--reveal-delay:var(--milestone-delay)]"
                style={
                  {
                    '--stacked-delay': `${(index % 2) * STAGGER}ms`,
                    '--milestone-delay': `${PATH_MILESTONES[index] + 100}ms`,
                  } as CSSProperties
                }
              >
                <div className="flex items-center gap-3 md:flex-col md:gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-accent-300/60 font-display text-sm text-accent-200">
                    {index + 1}
                  </span>
                  <p className="text-xs font-semibold tracking-[0.16em] text-accent-200/80 uppercase">{entry.when}</p>
                </div>
                <h3 className="mt-3 text-xl font-medium text-surface">{entry.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-100/75 md:mx-auto md:max-w-[15rem]">{entry.note}</p>
              </Reveal>
            ))}
          </ol>
        </Reveal>
      </Container>
    </section>
  )
}
