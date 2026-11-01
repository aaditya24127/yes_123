import type { CSSProperties } from 'react'
import { Eye, HeartHandshake, PencilLine, type LucideIcon } from 'lucide-react'
import { FernSprig } from '@/components/decor/FernSprig'
import { WashBackdrop } from '@/components/decor/WashBackdrop'
import { Reveal } from '@/components/motion/Reveal'
import { STAGGER } from '@/components/motion/timing'
import { Container } from '@/components/ui/Container'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { SharedMentoringMoment } from './SharedMentoringMoment'

const principles: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Eye, title: 'Evidence first', text: 'Every suggestion shows the records and observations behind it.' },
  { icon: PencilLine, title: 'You approve or edit', text: 'Nothing moves forward until a CRP reviews it, in their own words.' },
  { icon: HeartHandshake, title: 'Teachers at the centre', text: 'Actions are framed as support for teachers, never as judgments of them.' },
]

export function HumanInTheLoop() {
  return (
    <section id="your-judgment" aria-labelledby="judgment-title" className="relative isolate py-12 sm:py-16 lg:py-20">
      <WashBackdrop fillClass="fill-clay-50" />
      <FernSprig className="absolute bottom-6 left-2 -z-10 w-32 text-clay-200/80 sm:left-8 lg:w-40" />

      <Container className="grid max-w-wide items-center gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12 xl:grid-cols-[minmax(0,4.8fr)_minmax(0,7.2fr)] xl:gap-14">
        <div>
          <SectionHeading
            id="judgment-title"
            eyebrow="Human in the loop"
            title={
              <>
                The Copilot suggests. <em className="font-normal text-clay-500">You decide.</em>
              </>
            }
          />
          <ul className="mt-10 space-y-6">
            {principles.map(({ icon: Icon, title, text }, index) => (
              <Reveal as="li" key={title} delay={(index + 1) * STAGGER} className="flex gap-4">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-clay-100 text-clay-600">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-sans text-base font-semibold text-brand-950">{title}</h3>
                  <p className="mt-1 text-base leading-relaxed text-muted">{text}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </div>

        {/*
          Side by side, the expanded watercolor mentoring artwork accompanies the principles.
          Spreads naturally across the right column and into the page background.
        */}
        <Reveal
          variant="right"
          className="relative w-full [--reveal-delay:0ms] lg:[--reveal-delay:var(--panel-delay)]"
          style={{ '--panel-delay': `${4 * STAGGER}ms` } as CSSProperties}
        >
          <SharedMentoringMoment />
        </Reveal>
      </Container>
    </section>
  )
}
