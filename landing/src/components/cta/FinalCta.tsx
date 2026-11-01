import { ArrowRight } from 'lucide-react'
import { FallingLeaves } from '@/components/motion/FallingLeaves'
import { ctaLeaves } from '@/components/motion/leafPresets'
import { Reveal } from '@/components/motion/Reveal'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Container } from '@/components/ui/Container'
import { appLink } from '@/lib/appLinks'
import { ClosingLandscape } from './ClosingLandscape'

export function FinalCta() {
  return (
    <section id="get-started" aria-labelledby="get-started-title" className="relative isolate overflow-hidden pt-12 sm:pt-16 lg:pt-20">
      <FallingLeaves leaves={ctaLeaves} className="-z-10" />

      {/* Soft clouds drifting slowly across the sky. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[38%] -z-10 h-40">
        <div className="absolute left-[8%] h-24 w-[28rem] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(255_252_245/0.9),transparent)]" />
        <div className="absolute top-12 right-[6%] h-20 w-[22rem] animate-drift rounded-full bg-[radial-gradient(closest-side,rgb(245_232_200/0.7),transparent)] [animation-delay:-20s] [animation-duration:62s]" />
      </div>

      <Container className="relative text-center">
        <Reveal as="header" className="mx-auto max-w-3xl">
          <p className="inline-flex items-center gap-3 text-xs font-semibold tracking-[0.2em] text-teal-600 uppercase">
            <span className="h-px w-8 bg-current opacity-60" aria-hidden="true" />
            Begin with one school
            <span className="h-px w-8 bg-current opacity-60" aria-hidden="true" />
          </p>
          <h2 id="get-started-title" className="mt-5 text-[2.5rem] leading-[1.05] font-medium text-brand-950 sm:text-6xl lg:text-[4.25rem]">
            Every visit can leave a classroom <em className="font-normal text-teal-600">a little stronger</em>.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-muted">
            See how everyday school records become focused, practical mentoring, with you in charge of every decision.
          </p>
        </Reveal>
        <Reveal delay={200} className="mt-10 flex flex-wrap justify-center gap-3">
          <ButtonLink href={appLink()} size="lg">
            Open the app
            <ArrowRight className="size-4" aria-hidden="true" />
          </ButtonLink>
          <ButtonLink href="#how-it-works" size="lg" variant="secondary">
            See How It Works
          </ButtonLink>
        </Reveal>
      </Container>

      <ClosingLandscape className="-mt-4 sm:-mt-10 lg:-mt-16" />
    </section>
  )
}
