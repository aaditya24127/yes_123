'use client';
// The frame of the sign-in pages (CRP site and teacher app use the same file, kept in step): a green brand panel with what the app does, the form beside it
// (on a phone the panel becomes a short header and the form card slides up over it). The language button is always in the corner, so that a person
// who cannot read English can change the language before signing in.
import type { ReactNode } from 'react';
import LanguageSwitch from '@/components/LanguageSwitch';
import { useLang } from '@/lib/i18n';

export type AuthPoint = { icon: ReactNode; title: string; text: string };

export default function AuthLayout({ badge, headline, sub, points, children, footer }: {
  badge: string; headline: string; sub: string; points: AuthPoint[]; children: ReactNode; footer?: ReactNode;
}) {
  const { tr } = useLang();
  return (
    <div className="min-h-dvh bg-page lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <aside className="relative isolate overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900 px-5 pb-16 pt-5 text-white sm:px-8 lg:flex lg:min-h-dvh lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 -z-10 h-80 w-80 rounded-full bg-brand-400/20 blur-3xl" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl font-bold ring-1 ring-white/30">{'C'}</div>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-serif text-lg font-semibold">{tr('CRP Mentor Copilot')}</p>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{tr(badge)}</p>
          </div>
          <LanguageSwitch onDark className="ms-auto" />
        </div>

        <div className="mt-8 max-w-xl lg:mt-0">
          <h1 className="font-serif text-3xl font-semibold leading-tight sm:text-4xl lg:text-5xl">{tr(headline)}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-white/80 lg:text-lg">{tr(sub)}</p>
          <ul className="mt-8 hidden space-y-4 lg:block">
            {points.map((p) => (
              <li key={p.title} className="flex items-start gap-4">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/12 text-white ring-1 ring-white/25">{p.icon}</span>
                <span><b className="block font-semibold">{tr(p.title)}</b><span className="text-sm text-white/75">{tr(p.text)}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-0 hidden text-xs text-white/60 lg:block">{tr('Made for mentors and teachers of government and low-fee schools in India.')}</p>
      </aside>

      <main className="relative -mt-9 px-4 pb-10 sm:px-8 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:p-12">
        <div className="mx-auto w-full max-w-md">
          {children}
          {footer && <div className="mt-5 text-center">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
