'use client';
// Small shared pieces, styled like the CRP website (rounded cards, Evergreen buttons, serif titles).
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100 ${className}`}>{children}</section>;
}

export function Button({ children, busy, variant = 'solid', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean; variant?: 'solid' | 'soft' | 'ghost' }) {
  const look = variant === 'solid' ? 'bg-brand-600 text-white shadow-float hover:bg-brand-700' : variant === 'soft' ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200 hover:bg-brand-100' : 'text-ink-500 hover:text-brand-700';
  return (
    <button {...p} disabled={p.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${look} ${className}`}>
      {busy && <Loader2 size={16} className="animate-spin" />}{children}
    </button>
  );
}

const TONE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-800 ring-amber-200', submitted: 'bg-brand-50 text-brand-700 ring-brand-200', accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  late: 'bg-red-50 text-red-700 ring-red-200', plain: 'bg-white text-ink-500 ring-brand-100',
};
export function Badge({ tone = 'plain', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${TONE[tone]}`}>{children}</span>;
}

export function Empty({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-surface/60 px-6 py-10 text-center ring-1 ring-brand-100">
      <div className="text-brand-400">{icon}</div>
      <p className="font-serif text-lg font-semibold text-ink-900">{title}</p>
      {hint && <p className="max-w-xs text-sm text-ink-500">{hint}</p>}
    </div>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 mt-2">
      <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">{children}</h1>
      {sub && <p className="mt-1 text-sm text-ink-500">{sub}</p>}
    </div>
  );
}
