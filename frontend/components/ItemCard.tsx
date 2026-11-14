'use client';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, GraduationCap, HelpCircle, Repeat, UserCheck } from 'lucide-react';
import type { Item } from '@/lib/types';
import { BAND } from '@/lib/theme';
import ScoreRing from './ScoreRing';
import { useLang } from '@/lib/i18n';
import { visitHref } from '@/lib/visit-text';

const ICON: Record<string, typeof GraduationCap> = {
  learning_gap: GraduationCap, unresolved_issue: ClipboardList, overdue_followup: CalendarClock, time_since_visit: UserCheck, recurring_need: Repeat,
};
const TONE = ['bg-red-50 text-red-600', 'bg-orange-50 text-orange-600', 'bg-brand-50 text-brand-600'];

// Short headline for a category: first clause of its explanation.
const short = (t: string) => t.split(/;|\(/)[0].trim().replace(/\.$/, '');

export default function ItemCard({ item, onOpen, plain = false }: { item: Item; onOpen: (i: Item) => void; plain?: boolean }) {
  const { t, tx, dir, alert, fact , tr } = useLang();
  const band = item.band ? BAND[item.band] : null;
  const router = useRouter();
  const [tip, setTip] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!tip) return;
    const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setTip(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [tip]);

  const anim = plain ? {} : ({
    layout: 'position', layoutId: `${item.entity}-${item.id}`, initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 },
    transition: { type: 'spring', stiffness: 260, damping: 28 }, whileHover: { y: -4 },
  } as const);
  const facts = item.categories.filter((c) => c.score != null && c.score > 0).sort((a, b) => (b.contribution ?? 0) - (a.contribution ?? 0)).slice(0, 3);

  return (
    <motion.div {...anim} data-tour="card" role="button" dir={dir} tabIndex={0} onClick={() => onOpen(item)} onKeyDown={(e) => e.key === 'Enter' && onOpen(item)}
      className={`group relative flex h-full w-full cursor-pointer flex-col rounded-3xl p-5 text-start transition-shadow focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-200
        ${item.insufficient ? 'border border-dashed border-brand-200 bg-surface/70 shadow-float' : 'bg-surface shadow-float hover:shadow-lift'}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold ${item.rank ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}>
          {item.rank ?? <HelpCircle size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <h3 dir="auto" className="line-clamp-2 font-serif text-[17px] font-semibold leading-snug text-ink-900">{tr(item.name)}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold" style={{ color: band?.ring ?? 'rgb(var(--b600))' }}>
            <span className="h-2 w-2 rounded-full" style={{ background: band?.ring ?? 'rgb(var(--b400))' }} />
            {band ? tx('band', item.band!, band.label) : t('unranked')}
          </p>
        </div>
        <div data-tour="card-score" className="shrink-0"><ScoreRing value={item.score} color={band?.ring ?? '#94A3B8'} size={60} /></div>
      </div>

      <ul data-tour="card-facts" className="mt-4 space-y-2">
        {facts.map((c, i) => {
          const Icon = ICON[c.code] ?? ClipboardList;
          return (
            <li key={c.code} className="flex items-center gap-3 rounded-2xl bg-brand-50/60 px-3 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${TONE[i] ?? TONE[2]}`}><Icon size={16} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{tx('cat', c.code, c.label)}</span>
                <span dir="auto" className="block truncate text-[13.5px] font-medium text-ink-900">{fact(short(c.explanation))}</span>
              </span>
            </li>
          );
        })}
        {facts.length === 0 && <li className="rounded-2xl bg-brand-50/60 px-3 py-3 text-[13px] text-ink-500">{t('notEnough')}</li>}
      </ul>

      <div className="mt-auto flex items-center justify-between pt-4">
        <div ref={box} className="relative">
          {item.alerts.length > 0 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); setTip((v) => !v); }} aria-label={t('alerts')} title={t('alerts')}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 transition hover:bg-red-100">
                <AlertTriangle size={17} />
                {item.alerts.length > 1 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{item.alerts.length}</span>}
              </button>
              <AnimatePresence>
                {tip && (
                  <motion.div initial={{ opacity: 0, y: 6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6, scale: 0.97 }} onClick={(e) => e.stopPropagation()}
                    className="absolute bottom-11 start-0 z-20 w-64 space-y-2 rounded-2xl bg-surface p-3 text-[13px] leading-snug text-ink-700 shadow-panel ring-1 ring-red-100">
                    {item.alerts.map((a, i) => <p key={i} className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-red-600" />{alert(a)}</p>)}
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span data-tour="card-details" className="flex items-center text-sm font-semibold text-brand-600">{t('details')} <ChevronRight size={16} className="rtl:rotate-180" /></span>
          <button onClick={(e) => { e.stopPropagation(); router.push(visitHref(item)); }} onKeyDown={(e) => e.stopPropagation()} data-tour="card-visit"
            className="flex items-center gap-1.5 rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-float transition hover:bg-brand-700">
            <ClipboardCheck size={16} />{t('visit')}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
