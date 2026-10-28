import { FinalCta } from '@/components/cta/FinalCta'
import { FeatureFlashcards } from '@/components/features/FeatureFlashcards'
import { Hero } from '@/components/hero/Hero'
import { FollowUpImpact } from '@/components/impact/FollowUpImpact'
import { HumanInTheLoop } from '@/components/judgment/HumanInTheLoop'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { HowItWorks } from '@/components/process/HowItWorks'

export default function App() {
  return (
    <div id="top" className="paper-texture relative isolate min-h-svh overflow-x-clip">
      <SiteHeader />
      <main>
        <Hero />
        <FeatureFlashcards />
        <HowItWorks />
        <HumanInTheLoop />
        <FollowUpImpact />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
