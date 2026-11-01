import { FallingLeaves } from '@/components/motion/FallingLeaves'
import { heroBackLeaves, heroFrontLeaves } from '@/components/motion/leafPresets'
import { Container } from '@/components/ui/Container'
import { HeroCopy } from './HeroCopy'
import { HeroVisual } from './HeroVisual'

export function Hero() {
  return (
    // z-10 keeps the hero above leaves from the next section drifting up into it.
    <section aria-labelledby="hero-title" className="relative isolate z-10">
      <FallingLeaves leaves={heroBackLeaves} className="-z-10" />

      <Container className="grid max-w-wide items-center gap-y-8 pt-2 pb-12 sm:pt-4 sm:pb-16 lg:pt-6 lg:pb-18 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-x-8 xl:pb-20">
        <HeroCopy />
        <HeroVisual />
      </Container>

      <FallingLeaves leaves={heroFrontLeaves} className="z-20" />
    </section>
  )
}
