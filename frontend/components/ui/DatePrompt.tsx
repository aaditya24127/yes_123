'use client';
// A small pop-up that asks for a date. The button stays off until a date is picked, so nothing can be sent without one.
import { useEffect, useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { Button, Input } from './index';
import { todayIso } from '@/lib/visit-text';
import { useLang } from '@/lib/i18n';

export default function DatePrompt({ open, title, question, confirmLabel = 'Send', busy, onConfirm, onClose }: {
  open: boolean; title: string; question: string; confirmLabel?: string; busy?: boolean; onConfirm: (date: string) => void; onClose: () => void;
}) {
  const { tr } = useLang();
  const [date, setDate] = useState('');
  useEffect(() => { if (open) setDate(''); }, [open]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={tr(title)} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl bg-surface p-6 shadow-panel">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2"><span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-50 text-brand-700"><CalendarDays size={20} /></span>
            <h2 className="font-serif text-xl font-semibold text-ink-900">{tr(title)}</h2></div>
          <button onClick={onClose} aria-label={tr('Close')} className="rounded-full p-1.5 text-ink-400 hover:bg-brand-50"><X size={18} /></button>
        </div>
        <p className="mt-3 text-sm text-ink-700">{tr(question)}</p>
        <Input type="date" autoFocus value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} className="mt-3 !py-3 text-base" aria-label={tr('Date')} />
        {!date && <p className="mt-2 text-xs text-ink-500">{tr('Pick a date to continue.')}</p>}
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" disabled={!date} busy={busy} onClick={() => date && onConfirm(date)}>{tr(confirmLabel)}</Button>
          <Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button>
        </div>
      </div>
    </div>
  );
}
