'use client';
// Frame for every page except the ranking home: logo, menu, page title, then the page content.
import type { ReactNode } from 'react';
import { APP } from '@/lib/app.config';
import { LANDING_URL } from '@/lib/platform';
import NavLinks from './NavLinks';
import TutorialToggle from '@/components/tutorial/TutorialToggle';
import { useLang } from '@/lib/i18n';

export default function PageShell({ title, subtitle, actions, children, wide }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const { tr } = useLang();
  return (
    <main className={`mx-auto px-4 pb-16 sm:px-8 ${wide ? 'max-w-[1400px]' : 'max-w-[1100px]'}`}>
      <header className="flex flex-wrap items-center gap-3 pb-4 pt-5">
        <a href={LANDING_URL} className="flex items-center gap-2.5" aria-label={tr('{name} home page', { name: APP.name })} title={tr('Back to the landing page')}>
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white shadow-float">{tr(APP.short)}</div>
          <span className="hidden font-serif text-xl font-semibold tracking-tight text-ink-900 md:block">{tr(APP.name)}</span>
        </a>
        <div className="ms-auto flex items-center gap-3"><NavLinks /><TutorialToggle label /></div>
      </header>
      <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">{tr(title)}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-5">{children}</div>
    </main>
  );
}
