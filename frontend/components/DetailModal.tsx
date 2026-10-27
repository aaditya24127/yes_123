'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, AlertTriangle, FileSpreadsheet, FileText, FileAudio, Image as ImageIcon, FileType2, CheckCircle2, CircleHelp, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import type { EvidenceGroup, FileInfo, Item } from '@/lib/types';
import { BAND, CAT_COLORS, FEED_LABEL, SECTION_LABEL } from '@/lib/theme';
import ScoreRing from './ScoreRing';
import DataViewer from './DataViewer';
import { useLang, type Key } from '@/lib/i18n';

const TABS = ['Overview', 'Evidence', 'Data sources'] as const;
const TAB_KEY: Record<(typeof TABS)[number], Key> = { Overview: 'overview', Evidence: 'evidence', 'Data sources': 'dataSources' };
type Tab = (typeof TABS)[number];

function FileIcon({ f }: { f: FileInfo }) {
  const c = 'shrink-0 text-brand-600';
  if (f.format === 'xlsx' || f.format === 'csv') return <FileSpreadsheet size={18} className={c} />;
  if (f.format === 'mp3') return <FileAudio size={18} className={c} />;
  if (f.format === 'jpg') return <ImageIcon size={18} className={c} />;
  if (f.format === 'pdf') return <FileType2 size={18} className={c} />;
  return <FileText size={18} className={c} />;
}

const STATUS: Record<string, string> = {
  verified: 'bg-emerald-50 text-emerald-700', provisional: 'bg-sky-50 text-sky-700', unknown: 'bg-slate-100 text-slate-600', review: 'bg-amber-50 text-amber-700',
};
// Feed names that reuse the section wording.
const FEED_AS_SECTION: Record<string, string> = { overdue_followup: 'followups', time_since_visit: 'visits', attendance: 'attendance' };

export function DetailBody({ item, onClose, compact = false }: { item: Item; onClose: () => void; compact?: boolean }) {
  const { t, tx, dir, alert } = useLang();
  const feedLabel = (x: string) => (FEED_AS_SECTION[x] ? tx('sec', FEED_AS_SECTION[x], x) : tx('feed', x, FEED_LABEL[x] ?? x));
  const [tab, setTab] = useState<Tab>('Overview');
  const [ev, setEv] = useState<EvidenceGroup[] | null>(null);
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setEv(null); setFiles(null); setSel(null);
    api.evidence(item.entity, item.id).then((r) => live && setEv(r));
    api.files(item.school_id).then((r) => live && setFiles(r));
    return () => { live = false; };
  }, [item.entity, item.id, item.school_id]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const usedIds = useMemo(() => new Set((ev ?? []).flatMap((g) => g.records.map((r) => r.file?.id).filter(Boolean) as string[])), [ev]);
  const visibleFiles = useMemo(() => (!files ? [] : item.entity === 'teacher' ? files.filter((f) => usedIds.has(f.id)) : files), [files, item.entity, usedIds]);
  const grouped = useMemo(() => {
    const g: Record<string, FileInfo[]> = {};
    visibleFiles.forEach((f) => (g[f.section] ??= []).push(f));
    return g;
  }, [visibleFiles]);
  useEffect(() => { if (tab === 'Data sources' && !sel && visibleFiles.length) setSel(visibleFiles[0].id); }, [tab, sel, visibleFiles]);

  const openFile = (id: string) => { setSel(id); setTab('Data sources'); };
  const band = item.band ? BAND[item.band] : null;

  return (
    <div dir={dir} className="flex h-full min-h-0 flex-col">
      <div className="flex items-start gap-4 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-6 py-5">
        <ScoreRing value={item.score} color={band?.ring ?? '#94A3B8'} size={76} stroke={8} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 dir="auto" className="truncate font-serif text-2xl font-semibold text-ink-900">{item.name}</h2>
            {band && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${band.chip}`}>{tx('band', item.band!, band.label)}</span>}
            {item.rank && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">{t('rank', { n: item.rank })}</span>}
            {item.insufficient && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">{t('needsMore')}</span>}
          </div>
          <p dir="auto" className="mt-0.5 text-sm text-ink-500">{item.subtitle}</p>
          <div className="mt-2 flex max-w-sm items-center gap-2 text-xs text-ink-500">
            <span>{t('coverage')}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${item.coverage}%` }} /></div>
            <span className="font-semibold text-ink-700">{Math.round(item.coverage)}%</span>
          </div>
        </div>
        <button onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ink-500 transition hover:bg-brand-100 hover:text-brand-800"><X size={20} /></button>
      </div>

      <div className="flex gap-1 border-b border-brand-100 px-6 pt-2">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`relative rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${tab === tb ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'}`}>
            {t(TAB_KEY[tb])}
            {tab === tb && <motion.span layoutId="tabline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        ))}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-6">
        {tab === 'Overview' && (
          <div className="space-y-5">
            {item.alerts.length > 0 && (
              <div className="space-y-2">
                {item.alerts.map((a, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700"><AlertTriangle size={16} />{alert(a)}</div>
                ))}
              </div>
            )}
            {item.flags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {item.flags.map((f) => <span key={f.code} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">{tx('flag', f.code, f.label)}</span>)}
              </div>
            )}
            <div className={`grid gap-3 ${compact ? '' : 'md:grid-cols-2'}`}>
              {item.categories.map((c, i) => (
                <div key={c.code} className="rounded-2xl border border-brand-100 bg-surface p-4 shadow-float">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[i] }} />{tx('cat', c.code, c.label)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[c.status]}`}>{t(`st_${c.status}` as Key)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-brand-50">
                      <motion.div className="h-full rounded-full" style={{ background: CAT_COLORS[i] }} initial={{ width: 0 }} animate={{ width: `${c.score ?? 0}%` }} transition={{ duration: 0.6 }} />
                    </div>
                    <span className="w-10 text-end text-sm font-semibold tabular-nums">{c.score == null ? '–' : Math.round(c.score)}</span>
                  </div>
                  <p dir="auto" className="mt-2 text-[13px] leading-snug text-ink-700">{c.explanation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'Evidence' && (
          <div className="space-y-4">
            {!ev && <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />}
            {ev?.map((g, i) => (
              <div key={g.code} className="rounded-2xl border border-brand-100">
                <div className="flex items-center justify-between gap-3 border-b border-brand-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[i] }} />{tx('cat', g.code, g.label)}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-500">{g.status === 'unknown' ? <CircleHelp size={13} /> : <CheckCircle2 size={13} className="text-emerald-600" />}{t('records', { n: g.records.length })}</span>
                </div>
                {g.records.length === 0 && <p dir="auto" className="px-4 py-3 text-sm text-ink-500">{g.explanation}</p>}
                <ul className="divide-y divide-brand-50">
                  {g.records.map((r) => (
                    <li key={r.record_type + r.record_id} className="flex items-start gap-3 px-4 py-3">
                      <span className="mt-0.5 w-20 shrink-0 text-xs font-medium text-ink-400">{r.date}</span>
                      <p dir="auto" className="flex-1 text-[13px] leading-snug text-ink-700">{r.summary}</p>
                      {r.file && (
                        <button onClick={() => openFile(r.file!.id)} className="flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100" title={r.locator ?? ''}>
                          <Eye size={13} /><span className="truncate">{r.file.name}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {tab === 'Data sources' && (
          <div className={`grid h-full min-h-[480px] gap-4 ${compact ? '' : 'lg:grid-cols-[320px_1fr]'}`}>
            <div className={`thin-scroll space-y-4 overflow-y-auto pr-1 ${compact ? 'max-h-60' : ''}`}>
              {!files && <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />}
              {Object.entries(grouped).map(([sec, fs]) => (
                <div key={sec}>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{tx('sec', sec, SECTION_LABEL[sec] ?? sec)}</p>
                  <div className="space-y-1.5">
                    {fs.map((f) => (
                      <button key={f.id} onClick={() => setSel(f.id)} className={`flex w-full items-start gap-2.5 rounded-2xl border p-3 text-start transition ${sel === f.id ? 'border-brand-500 bg-brand-50 shadow-float' : 'border-brand-100 bg-surface hover:border-brand-300'}`}>
                        <FileIcon f={f} />
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className="truncate text-[13px] font-semibold text-ink-900">{f.name}</p>
                          <p className="text-[11px] text-ink-500">{f.record_date} · {f.format.toUpperCase()}{f.scanned ? ` · ${t('scanned')}` : ''}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {f.feeds.map((x) => <span key={x} className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-800">{feedLabel(x)}</span>)}
                            {f.duplicate_of && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">{t('duplicate')}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="min-h-[480px] min-w-0">
              {sel && files ? <DataViewer file={files.find((f) => f.id === sel)!} key={sel} /> : <p className="text-sm text-ink-500">{t('selectFile')}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DetailModal({ item, onClose }: { item: Item | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-ink-900/25 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label={item.name} className="fixed inset-x-3 bottom-3 top-3 z-50 mx-auto flex max-w-6xl flex-col overflow-hidden rounded-[28px] bg-surface shadow-panel sm:inset-x-6 sm:bottom-6 sm:top-6"
            initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <DetailBody item={item} onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
