import { ArrowRight, Sprout } from 'lucide-react'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { appLink } from '@/lib/appLinks'

export function HeroCopy() {
  return (
    <div className="relative z-10 max-w-xl pb-2 lg:pb-6">
      <p className="inline-flex animate-rise-in items-center gap-2 rounded-full border border-brand-800/15 bg-surface/70 px-3.5 py-1.5 text-xs font-medium tracking-wide text-brand-800">
        <Sprout className="size-3.5 text-accent-500" aria-hidden="true" />
        AI mentoring support for Cluster Resource Persons
      </p>

      <h1
        id="hero-title"
        className="mt-6 animate-rise-in text-[2.6rem] leading-[1.04] font-medium text-brand-950 [animation-delay:120ms] sm:text-6xl lg:text-[4rem] xl:text-[4.5rem]"
      >
        Every school visit, <em className="font-normal text-teal-600">thoughtfully</em> guided.
      </h1>

      <div className="mt-8 flex animate-rise-in flex-wrap gap-3 [animation-delay:240ms]">
        <ButtonLink href={appLink()} size="lg">
          Open the app
          <ArrowRight className="size-4" aria-hidden="true" />
        </ButtonLink>
        <ButtonLink href="#how-it-works" size="lg" variant="secondary">
          See how it works
        </ButtonLink>
      </div>
    </div>
  )
}
