import { ArrowUp, ShieldCheck } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { Logo } from './Logo'
import { sectionLinks } from './navigation'

export function SiteFooter() {
  return (
    <footer className="bg-brand-900 text-brand-100">
      <Container className="max-w-wide pt-6 pb-10 lg:pt-10">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)] lg:gap-16">
          <div>
            <a href="#top" aria-label="CRP Mentor Copilot, back to top" className="inline-block rounded-md">
              <Logo tone="light" />
            </a>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-brand-100/75">
              An AI-powered mentoring support platform that helps Cluster Resource Persons understand school needs, plan
              focused visits and follow up on progress with teachers.
            </p>
          </div>

          <nav aria-label="Footer">
            <h2 className="font-sans text-xs font-semibold tracking-[0.18em] text-accent-200 uppercase">Explore</h2>
            <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 lg:grid-cols-1">
              {sectionLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="text-sm text-brand-100/85 transition-colors hover:text-surface">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-labelledby="responsible-ai-title" className="rounded-card border border-brand-50/15 bg-brand-50/5 p-6">
            <h2 id="responsible-ai-title" className="flex items-center gap-2 font-sans text-sm font-semibold text-surface">
              <ShieldCheck className="size-4 text-accent-300" aria-hidden="true" />
              Responsible AI
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-brand-100/80">
              CRP Mentor Copilot offers suggestions, not decisions. Cluster Resource Persons review the evidence and retain
              final authority over every recommendation, visit and follow-up.
            </p>
          </section>
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-brand-50/10 pt-6 text-xs text-brand-100/60 sm:flex-row sm:items-center sm:justify-between">
          <p>Made by Byte Busters.</p>
          <a href="#top" className="inline-flex items-center gap-1.5 font-medium text-brand-100/80 hover:text-surface">
            <ArrowUp className="size-3.5" aria-hidden="true" />
            Back to top
          </a>
        </div>
      </Container>
    </footer>
  )
}
