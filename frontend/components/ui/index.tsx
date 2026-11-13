'use client';
// Shared building blocks. Change the look of every page from here (colours come from the theme in globals.css / lib/theme.ts).
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'soft' | 'ghost' | 'danger';
const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-float hover:bg-brand-700',
  soft: 'bg-brand-50 text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100',
  ghost: 'text-brand-700 hover:bg-brand-50',
  danger: 'bg-red-50 text-red-700 ring-1 ring-red-100 hover:bg-red-100',
};

export function Button({ variant = 'primary', busy, icon, children, className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; icon?: ReactNode }) {
  return (
    <button {...p} disabled={p.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${className}`}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : icon}{children}
    </button>
  );
}

export function Card({ children, className = '', title, action, subtitle, tour }: { children: ReactNode; className?: string; title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; tour?: string }) {
  return (
    <section data-tour={tour} className={`rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>{title && <h2 className="font-serif text-lg font-semibold text-ink-900">{title}</h2>}{subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONE = { neutral: 'bg-slate-100 text-slate-700', brand: 'bg-brand-50 text-brand-700', good: 'bg-emerald-50 text-emerald-700', warn: 'bg-amber-50 text-amber-800', bad: 'bg-red-50 text-red-700' };
export type Tone = keyof typeof TONE;
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]} ${className}`}>{children}</span>;
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-ink-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

const INPUT = 'w-full rounded-xl bg-surface px-3 py-2 text-sm text-ink-900 ring-1 ring-brand-100 outline-none transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...p }, ref) {
  return <input ref={ref} {...p} className={`${INPUT} ${className}`} />;
});
export function Select({ className = '', children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`${INPUT} ${className}`}>{children}</select>;
}
export function TextArea({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`${INPUT} min-h-[90px] ${className}`} />;
}

export function Spinner({ label }: { label?: string }) {
  return <div className="flex items-center gap-2 text-sm text-ink-500"><Loader2 size={16} className="animate-spin text-brand-600" />{label}</div>;
}

export function Empty({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return <div className="flex flex-col items-center gap-2 rounded-2xl bg-brand-50/50 px-4 py-8 text-center text-sm text-ink-500">{icon}{children}</div>;
}

export function ErrorNote({ error, onClose }: { error: string; onClose?: () => void }) {
  if (!error) return null;
  return (
    <div className="flex items-start justify-between gap-3 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{error}</span>{onClose && <button onClick={onClose} className="text-xs font-semibold underline">OK</button>}
    </div>
  );
}

export function Note({ children, tone = 'brand' }: { children: ReactNode; tone?: Tone }) {
  return <div className={`rounded-2xl px-4 py-3 text-sm ${TONE[tone]}`}>{children}</div>;
}

export function List({ items, empty }: { items: ReactNode[]; empty?: ReactNode }) {
  if (!items.length) return <p className="text-sm text-ink-400">{empty ?? '—'}</p>;
  return <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-sm text-ink-700"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />{x}</li>)}</ul>;
}

export function Stepper({ steps, current, onPick, maxReached }: { steps: string[]; current: number; onPick?: (i: number) => void; maxReached?: number }) {
  const box = useRef<HTMLOListElement>(null);
  // On a phone the bar scrolls sideways: keep the current step in view.
  useEffect(() => { box.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [current]);
  return (
    <ol ref={box} data-tour="stepper" className="no-bar -mx-4 flex items-center gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {steps.map((s, i) => {
        const done = i < current, here = i === current, can = onPick && i <= (maxReached ?? current);
        return (
          <li key={s} className="flex shrink-0 items-center gap-2">
            <button disabled={!can} aria-current={here ? 'step' : undefined} onClick={() => can && onPick?.(i)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${here ? 'bg-brand-600 text-white ring-brand-600 shadow-float' : done ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-surface text-ink-400 ring-brand-100'} ${can ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${here ? 'bg-white/20' : 'bg-brand-100 text-brand-700'}`}>{i + 1}</span>{s}
            </button>
            {i < steps.length - 1 && <span className="h-px w-4 bg-brand-200" />}
          </li>
        );
      })}
    </ol>
  );
}

export function Pill({ active, onClick, children }: { active?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition ${active ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-ink-700 ring-brand-100 hover:ring-brand-300'}`}>
      {children}
    </button>
  );
}
