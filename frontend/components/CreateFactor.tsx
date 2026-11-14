'use client';
// "Create your own factor": the CRP describes it in plain words, a definition is suggested, the CRP
// adjusts it, optionally types in or uploads the numbers per school, and switches it on.
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useDirectory } from '@/lib/hooks';
import type { FactorMode, FactorSuggestion } from '@/lib/types';
import { Button, ErrorNote, Field, Input, Note, Select, TextArea } from './ui';
import { useLang } from '@/lib/i18n';

const MODES: { v: FactorMode; label: string }[] = [
  { v: 'higher', label: 'More of it = visit sooner' }, { v: 'lower', label: 'Less of it = visit sooner' },
  { v: 'below_target', label: 'Further below a target = visit sooner' }, { v: 'above_target', label: 'Further above a target = visit sooner' },
  { v: 'yes', label: 'A “yes” = visit sooner' },
];

export default function CreateFactor({ open, onClose, onCreated, onUseExisting }: {
  open: boolean; onClose: () => void; onCreated: (code: string) => void; onUseExisting: (code: string) => void;
}) {
  const { tr } = useLang();
  const dir = useDirectory();
  const [desc, setDesc] = useState('');
  const [s, setS] = useState<FactorSuggestion | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!open) { setDesc(''); setS(null); setValues({}); setFile(null); setError(''); } }, [open]);
  // prefill numbers already stored for this data field
  useEffect(() => {
    if (!s?.fact_key || s.existing_code) return;
    api.factors.values(s.fact_key).then((r) => setValues(Object.fromEntries(r.values.filter((v) => v.value !== null).map((v) => [v.school_id, String(v.value)])))).catch(() => {});
  }, [s?.fact_key, s?.existing_code]);

  const suggest = async () => {
    if (!desc.trim()) return; setBusy(true); setError('');
    try { setS(await api.factors.suggest(desc)); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const create = async () => {
    if (!s) return; setBusy(true); setError('');
    try {
      const vals = Object.entries(values).filter(([, v]) => v.trim() !== '').map(([school_id, value]) => ({ school_id, value }));
      const r = await api.factors.create({ name: s.name, description: s.description, fact_key: s.fact_key, fact_label: s.fact_label, unit: s.unit, entity_scope: s.entity_scope,
        mode: s.mode, low: s.low, high: s.high, target: s.target, values: vals, proposed_by: s.suggested_by === 'rules' ? 'crp' : 'llm', weight: 10 });
      if (file) await api.factors.uploadValues(r.fact_key, file);
      onCreated(r.code);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const set = (k: keyof FactorSuggestion, v: unknown) => setS((x) => (x ? { ...x, [k]: v } : x));
  const num = (v: string) => (v === '' ? null : Number(v));

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-ink-900/30 p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="dialog" aria-label={tr('Create a factor')} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
            className="thin-scroll max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[28px] bg-surface p-4 shadow-panel sm:p-6">
            <div className="flex items-start justify-between">
              <h2 className="font-serif text-2xl font-semibold text-ink-900">{tr('Create your own factor')}</h2>
              <button onClick={onClose} aria-label={tr('Close')} className="rounded-full p-2 text-ink-500 hover:bg-brand-50"><X size={20} /></button>
            </div>
            <p className="mt-1 text-sm text-ink-500">{tr('Say in plain words what should make a school come up sooner. Example: “schools with more girls”, “schools without a working toilet”, “fewer than 2 teachers for primary”.')}</p>
            <div className="mt-4 flex gap-2">
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && suggest()} placeholder={tr('Schools with more girls should be visited first')} />
              <Button onClick={suggest} busy={busy && !s} icon={<Sparkles size={16} />}>{tr('Suggest')}</Button>
            </div>
            <div className="mt-3"><ErrorNote error={error} onClose={() => setError('')} /></div>

            {s && s.existing_code && (
              <div className="mt-4 space-y-3">
                <Note>{tr(s.explanation)}</Note>
                <Button onClick={() => { onUseExisting(s.existing_code!); onClose(); }}>{tr('Switch on “{name}”', { name: s.name })}</Button>
              </div>
            )}

            {s && !s.existing_code && (
              <div className="mt-4 space-y-4">
                <Note>{tr(s.explanation)}</Note>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={tr('Factor name')}><Input value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
                  <Field label={tr('The number each school needs')}><Input value={s.fact_label} onChange={(e) => set('fact_label', e.target.value)} /></Field>
                  <Field label={tr('How it raises priority')}><Select value={s.mode} onChange={(e) => set('mode', e.target.value)}>{MODES.map((m) => <option key={m.v} value={m.v}>{tr(m.label)}</option>)}</Select></Field>
                  <Field label={tr('Unit (optional)')}><Input value={s.unit ?? ''} onChange={(e) => set('unit', e.target.value || null)} placeholder={tr('girls, toilets, %')} /></Field>
                  {(s.mode === 'higher' || s.mode === 'lower') && (<>
                    <Field label={s.mode === 'higher' ? tr('At or below this = no extra priority') : tr('At or above this = no extra priority')}><Input type="number" value={s.low ?? ''} onChange={(e) => set('low', num(e.target.value))} /></Field>
                    <Field label={s.mode === 'higher' ? tr('At or above this = full priority') : tr('At or below this = full priority')}><Input type="number" value={s.high ?? ''} onChange={(e) => set('high', num(e.target.value))} /></Field>
                  </>)}
                  {(s.mode === 'below_target' || s.mode === 'above_target') && <Field label={tr('Target')}><Input type="number" value={s.target ?? ''} onChange={(e) => set('target', num(e.target.value))} /></Field>}
                  <Field label={tr('Applies to')}><Select value={s.entity_scope} onChange={(e) => set('entity_scope', e.target.value)}>
                    <option value="school">{tr('Schools')}</option><option value="teacher">{tr('Teachers')}</option><option value="both">{tr('Both')}</option></Select></Field>
                </div>

                <div>
                  <p className="text-sm font-semibold text-ink-900">{tr('Add the numbers now (optional)')}</p>
                  <p className="text-xs text-ink-500">{tr('Schools without a number are simply not scored on this factor. You can also add numbers later, or upload a file with them.')}</p>
                  {s.entity_scope !== 'teacher' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {dir?.schools.map((sc) => (
                        <label key={sc.id} className="flex items-center gap-2 rounded-xl bg-brand-50/50 px-3 py-1.5 text-sm">
                          <span className="min-w-0 flex-1 truncate" title={tr(sc.name)}>{tr(sc.code)} · {tr(sc.name)}</span>
                          <input value={values[sc.id] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [sc.id]: e.target.value }))}
                            className="w-24 rounded-lg bg-surface px-2 py-1 text-end ring-1 ring-brand-100 outline-none focus:ring-2 focus:ring-brand-500" placeholder={s.mode === 'yes' ? 'yes/no' : '–'} />
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <label className="cursor-pointer font-semibold text-brand-700 underline">{tr('Or upload Excel / CSV (school name + number)')}{' '}<input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                    {file && <span className="text-ink-500">{tr(file.name)}</span>}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>{tr('Cancel')}</Button>
                  <Button onClick={create} busy={busy} disabled={!s.name.trim() || !s.fact_key}>{tr('Create and switch on')}</Button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
