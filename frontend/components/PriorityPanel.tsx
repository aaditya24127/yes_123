'use client';
import { AnimatePresence, motion } from 'framer-motion';
import { X, RotateCcw, Check } from 'lucide-react';
import type { Category } from '@/lib/types';
import { CAT_COLORS } from '@/lib/theme';
import { useLang } from '@/lib/i18n';

interface BodyProps {
  onClose: () => void; categories: Category[]; weights: Record<string, number>;
  onChange: (code: string, v: number) => void; onReset: () => void; onApply: () => void; applying: boolean; dirty: boolean;
}

export function PriorityBody({ onClose, categories, weights, onChange, onReset, onApply, applying, dirty }: BodyProps) {
  const { t, tx, dir } = useLang();
  const total = categories.reduce((s, c) => s + (weights[c.code] ?? 0), 0);
  const share = (code: string) => (total > 0 ? Math.round(((weights[code] ?? 0) / total) * 100) : 0);
  return (
    <div dir={dir} className="flex h-full min-h-0 flex-col">
      <div className="flex items-start justify-between">
        <h2 className="font-serif text-2xl font-semibold text-ink-900">{t('configure')}</h2>
        <button onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ink-500 transition hover:bg-brand-50 hover:text-brand-700"><X size={20} /></button>
      </div>

      <div className="mt-5 flex h-3 overflow-hidden rounded-full bg-brand-50">
        {categories.map((c, i) => (
          <motion.div key={c.code} className="h-full" style={{ background: CAT_COLORS[i] }} initial={false} animate={{ width: `${share(c.code)}%` }} transition={{ type: 'spring', stiffness: 200, damping: 28 }} />
        ))}
      </div>

      <div className="thin-scroll -me-2 mt-4 flex-1 space-y-6 overflow-y-auto pe-2">
        {categories.map((c, i) => {
          const v = weights[c.code] ?? 0;
          return (
            <div key={c.code}>
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor={`w-${c.code}`} className="flex items-center gap-2 text-[15px] font-semibold text-ink-900">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[i] }} />{tx('cat', c.code, c.label)}
                </label>
                <span className="text-lg font-semibold tabular-nums text-ink-900">{v}%</span>
              </div>
              <input id={`w-${c.code}`} type="range" min={0} max={100} step={1} value={v} className="prio-range mt-1" style={{ ['--p' as string]: `${v}%` }}
                onChange={(e) => onChange(c.code, Number(e.target.value))} />
              <p className="mt-0.5 text-xs text-ink-500">{t('ofRanking', { p: share(c.code) })}</p>
            </div>
          );
        })}
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
    </div>
  );
}

export default function PriorityPanel({ open, ...body }: BodyProps & { open: boolean }) {
  const { t } = useLang();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink-900/5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={body.onClose} />
          <motion.aside role="dialog" aria-label="Priority settings"
            className="fixed bottom-4 right-4 top-4 z-50 flex w-[min(440px,calc(100vw-2rem))] flex-col rounded-[28px] bg-surface p-6 shadow-panel"
            initial={{ x: 480, opacity: 0.6 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 480, opacity: 0.6 }} transition={{ type: 'spring', stiffness: 280, damping: 32 }}>
            <PriorityBody {...body} />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
