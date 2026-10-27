'use client';
// Frame for every page except the ranking home: logo, menu, page title, then the page content.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { APP } from '@/lib/app.config';
import NavLinks from './NavLinks';

export default function PageShell({ title, subtitle, actions, children, wide }: { title: string; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto px-4 pb-16 sm:px-8 ${wide ? 'max-w-[1400px]' : 'max-w-[1100px]'}`}>
      <header className="flex flex-wrap items-center gap-3 pb-4 pt-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white shadow-float">{APP.short}</div>
          <span className="hidden font-serif text-xl font-semibold tracking-tight text-ink-900 md:block">{APP.name}</span>
        </Link>
        <div className="ms-auto"><NavLinks /></div>
      </header>
      <div className="mb-5 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="space-y-5">{children}</div>
    </main>
  );
}
