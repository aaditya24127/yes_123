'use client';
import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCcw, Check, Plus, Minus, Sparkles, ChevronDown } from 'lucide-react';
import type { Category, Config } from '@/lib/types';
import { CAT_COLORS } from '@/lib/theme';
import { useLang } from '@/lib/i18n';
import { FEATURES } from '@/lib/app.config';
import CreateFactor from './CreateFactor';

type LibItem = Config['library'][number];
interface BodyProps {
  onClose: () => void; categories: Category[]; weights: Record<string, number>;
  onChange: (code: string, v: number) => void; onReset: () => void; onApply: () => void; applying: boolean; dirty: boolean;
  library?: LibItem[]; onFactorsChanged?: () => void;
}

export function PriorityBody({ onClose, categories, weights, onChange, onReset, onApply, applying, dirty, library = [], onFactorsChanged }: BodyProps) {
  const { t, tx, dir } = useLang();
  const [showLib, setShowLib] = useState(false);
  const [creating, setCreating] = useState(false);
  // Sliders: factors already in the saved list + any library factor the CRP switched on in this session.
  const shown = useMemo(() => [...categories, ...library.filter((c) => (weights[c.code] ?? 0) > 0)], [categories, library, weights]);
  const off = useMemo(() => library.filter((c) => !((weights[c.code] ?? 0) > 0)), [library, weights]);
  const groups = useMemo(() => {
    const g: Record<string, LibItem[]> = {};
    off.forEach((c) => (g[c.group || 'Other'] ??= []).push(c));
    return g;
  }, [off]);
  const total = shown.reduce((s, c) => s + (weights[c.code] ?? 0), 0);
  const share = (code: string) => (total > 0 ? Math.round(((weights[code] ?? 0) / total) * 100) : 0);
  const fromLibrary = new Set(library.map((c) => c.code));

  return (
    <div dir={dir} className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between">
        <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('configure')}</h2>
        <button onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ink-500 transition hover:bg-brand-50 hover:text-brand-700"><X size={20} /></button>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-brand-50">
        {shown.map((c, i) => (
          <motion.div key={c.code} className="h-full" style={{ background: CAT_COLORS[i] }} initial={false} animate={{ width: `${share(c.code)}%` }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} />
        ))}
      </div>

      <div className="thin-scroll -me-2 mt-4 flex-1 space-y-6 overflow-y-auto pe-2">
        {shown.map((c, i) => {
          const v = weights[c.code] ?? 0;
          return (
            <div key={c.code}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`w-${c.code}`} className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-ink-900" title={c.description}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CAT_COLORS[i] }} /><span className="truncate">{tx('cat', c.code, c.label)}</span>
                </label>
                <span className="flex items-center gap-1">
                  {fromLibrary.has(c.code) && <button onClick={() => onChange(c.code, 0)} title="Switch off" className="rounded-full p-1 text-ink-400 hover:bg-brand-50 hover:text-red-600"><Minus size={14} /></button>}
                  <span className="text-lg font-semibold tabular-nums text-ink-900">{v}%</span>
                </span>
              </div>
              <input id={`w-${c.code}`} type="range" min={0} max={100} step={1} value={v} className="prio-range mt-1" style={{ ['--p' as string]: `${v}%` }}
                onChange={(e) => onChange(c.code, Number(e.target.value))} />
              <p className="mt-0.5 text-xs text-ink-500">{t('ofRanking', { p: share(c.code) })}</p>
            </div>
          );
        })}

        {(off.length > 0 || FEATURES.customFactors) && (
          <div className="rounded-2xl bg-brand-50/60 p-3">
            <button onClick={() => setShowLib((x) => !x)} className="flex w-full items-center justify-between text-sm font-semibold text-brand-800">
              <span className="flex items-center gap-2"><Plus size={16} />{t('moreFactors')} ({off.length})</span>
              <ChevronDown size={16} className={`transition ${showLib ? 'rotate-180' : ''}`} />
            </button>
            {showLib && (
              <div className="mt-3 space-y-4">
                {FEATURES.customFactors && (
                  <button onClick={() => setCreating(true)} className="flex w-full items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 hover:ring-brand-400">
                    <Sparkles size={16} />{t('createFactor')}
                  </button>
                )}
                {Object.entries(groups).map(([g, list]) => (
                  <div key={g}>
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400">{g}</p>
                    <ul className="space-y-1.5">
                      {list.map((c) => (
                        <li key={c.code} className="flex items-start gap-2 rounded-xl bg-surface px-3 py-2 ring-1 ring-brand-100">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink-900">{c.name}</p>
                            <p className="text-xs leading-snug text-ink-500">{c.description}</p>
                            {c.data_hint && <p className="mt-0.5 text-[11px] text-ink-400">Uses: {c.data_hint}{c.scope && c.scope !== 'both' ? ` · ${c.scope}s only` : ''}</p>}
                          </div>
                          <button onClick={() => onChange(c.code, 10)} className="shrink-0 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700">Add</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-brand-100 pt-4">
        <button onClick={onReset} className="flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50">
          <RotateCcw size={16} /> {t('reset')}
        </button>
        <button onClick={onApply} disabled={applying || total <= 0}
          className="ms-auto flex items-center gap-2 rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white shadow-float transition hover:bg-brand-700 disabled:opacity-50">
          <Check size={16} /> {applying ? t('saving') : dirty ? t('savePrio') : t('savedBtn')}
        </button>
      </div>
      <CreateFactor open={creating} onClose={() => setCreating(false)} onUseExisting={(code) => onChange(code, 10)}
        onCreated={() => { setCreating(false); onFactorsChanged?.(); }} />
    </div>
  );
}

export default function PriorityPanel({ open, ...body }: BodyProps & { open: boolean }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink-900/5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={body.onClose} />
          <motion.aside role="dialog" aria-label="Priority settings"
            className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(460px,calc(100vw-2rem))] flex-col rounded-[28px] bg-surface p-6 shadow-panel"
            initial={{ x: 480, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0.6 }} transition={{ type: 'spring', stiffness: 280, damping: 32 }}>
            <PriorityBody {...body} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
