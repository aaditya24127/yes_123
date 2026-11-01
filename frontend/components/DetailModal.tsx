'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { X, AlertTriangle, ChevronDown, ClipboardCheck, FileSpreadsheet, FileText, FileAudio, Image as ImageIcon, FileType2, CheckCircle2, CircleHelp, Eye } from 'lucide-react';
import { api } from '@/lib/api';
import type { EvidenceGroup, FileInfo, Item } from '@/lib/types';
import { BAND, CAT_COLORS, FEED_LABEL, SECTION_LABEL } from '@/lib/theme';
import ScoreRing from './ScoreRing';
import DataViewer from './DataViewer';
import { useLang, type Key } from '@/lib/i18n';
import OverrideBox from './OverrideBox';
import { FEATURES } from '@/lib/app.config';
import { visitHref } from '@/lib/visit-text';

const TABS = ['Evidence', 'Data sources'] as const;
const TAB_KEY: Record<(typeof TABS)[number], Key> = { Evidence: 'evidence', 'Data sources': 'dataSources' };
type Tab = (typeof TABS)[number];

function FileIcon({ f }: { f: FileInfo }) {
  const c = 'shrink-0 text-brand-600';
  if (f.format === 'xlsx' || f.format === 'csv') return <FileSpreadsheet size={18} className={c} />;
  if (f.format === 'mp3') return <FileAudio size={18} className={c} />;
  if (f.format === 'jpg') return <ImageIcon size={18} className={c} />;
  if (f.format === 'pdf') return <FileType2 size={18} className={c} />;
  return <FileText size={18} className={c} />;
}

// Feed names that reuse the section wording.
const FEED_AS_SECTION: Record<string, string> = { overdue_followup: 'followups', time_since_visit: 'visits', attendance: 'attendance' };

export function DetailBody({ item, onClose, compact = false }: { item: Item; onClose: () => void; compact?: boolean }) {
  const { t, tx, dir, alert } = useLang();
  const feedLabel = (x: string) => (FEED_AS_SECTION[x] ? tx('sec', FEED_AS_SECTION[x], x) : tx('feed', x, FEED_LABEL[x] ?? x));
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Evidence');
  const [ev, setEv] = useState<EvidenceGroup[] | null>(null);
  const [files, setFiles] = useState<FileInfo[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  // On a phone the files and the viewer are two screens: pick a file, then see it (with a way back). On a wide screen they sit side by side.
  const [wide, setWide] = useState(true);
  const [alertsOpen, setAlertsOpen] = useState(false);
  useEffect(() => { const on = () => setWide(window.innerWidth >= 1024); on(); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);

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
  useEffect(() => { if (tab === 'Data sources' && !sel && wide && visibleFiles.length) setSel(visibleFiles[0].id); }, [tab, sel, visibleFiles, wide]);

  const openFile = (id: string) => { setSel(id); setTab('Data sources'); };
  const band = item.band ? BAND[item.band] : null;

  return (
    <div dir={dir} className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3 border-b border-brand-100 bg-gradient-to-r from-brand-50 to-white px-4 py-4 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-5">
        <span className="sm:hidden"><ScoreRing value={item.score} color={band?.ring ?? '#94A3B8'} size={56} stroke={7} /></span>
        <span className="hidden sm:block"><ScoreRing value={item.score} color={band?.ring ?? '#94A3B8'} size={76} stroke={8} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 dir="auto" className="font-serif text-xl font-semibold leading-snug text-ink-900 sm:truncate sm:text-2xl">{item.name}</h2>
            {band && <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${band.chip}`}>{tx('band', item.band!, band.label)}</span>}
            {item.rank && <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-semibold text-white">{t('rank', { n: item.rank })}</span>}
            {item.insufficient && <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200">{t('needsMore')}</span>}
          </div>
          <p dir="auto" className="mt-0.5 text-sm text-ink-500">{item.subtitle}</p>
          <div className="mt-2 hidden max-w-sm items-center gap-2 text-xs text-ink-500 sm:flex">
            <span>{t('coverage')}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600" style={{ width: `${item.coverage}%` }} /></div>
            <span className="font-semibold text-ink-700">{Math.round(item.coverage)}%</span>
          </div>
        </div>
        <button onClick={() => router.push(visitHref(item))} className="order-last flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 py-2.5 sm:order-none sm:w-auto text-sm font-semibold text-white shadow-float transition hover:bg-brand-700">
          <ClipboardCheck size={17} />{t('visit')}
        </button>
        <button onClick={onClose} aria-label={t('close')} className="rounded-full p-2 text-ink-500 transition hover:bg-brand-100 hover:text-brand-800"><X size={20} /></button>
      </div>
      {item.alerts.length > 0 && (
        <div className="border-b border-brand-100 px-4 py-3 sm:px-6">
          <button onClick={() => setAlertsOpen((v) => !v)} aria-expanded={alertsOpen} className="flex w-full items-center gap-2 text-sm font-semibold text-red-700 sm:hidden">
            <AlertTriangle size={15} className="shrink-0" />{item.alerts.length} {item.alerts.length === 1 ? 'alert' : 'alerts'}<ChevronDown size={16} className={`ms-auto transition ${alertsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className={`${alertsOpen ? 'mt-2 block' : 'hidden'} space-y-1.5 sm:mt-0 sm:block`}>
            {item.alerts.map((a, i) => <p key={i} className="flex items-center gap-2 text-sm font-medium text-red-700"><AlertTriangle size={15} className="shrink-0" />{alert(a)}</p>)}
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-brand-100 px-4 pt-2 sm:px-6">
        {TABS.map((tb) => (
          <button key={tb} onClick={() => setTab(tb)} className={`relative rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${tab === tb ? 'text-brand-700' : 'text-ink-500 hover:text-ink-900'}`}>
            {t(TAB_KEY[tb])}
            {tab === tb && <motion.span layoutId="tabline" className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-600" />}
          </button>
        ))}
      </div>

      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {tab === 'Evidence' && (
          <div className="space-y-4">
            {!ev && <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />}
            {ev?.length && ev.every((g) => g.records.length === 0) ? <p className="rounded-2xl bg-brand-50/60 px-4 py-6 text-center text-sm text-ink-500">{t('notEnough')}</p> : null}
            {ev?.map((g, i) => g.records.length === 0 ? null : (
              <div key={g.code} className="rounded-2xl border border-brand-100">
                <div className="flex items-center justify-between gap-3 border-b border-brand-50 px-4 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-ink-900"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLORS[i] }} />{tx('cat', g.code, g.label)}</span>
                  <span className="flex items-center gap-1 text-xs text-ink-500">{g.status === 'unknown' ? <CircleHelp size={13} /> : <CheckCircle2 size={13} className="text-emerald-600" />}{t('records', { n: g.records.length })}</span>
                </div>
                {g.records.length === 0 && <p dir="auto" className="px-4 py-3 text-sm text-ink-500">{g.explanation}</p>}
                <ul className="divide-y divide-brand-50">
                  {g.records.map((r) => (
                    <li key={r.record_type + r.record_id} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 px-4 py-3 sm:flex-nowrap">
                      <span className="mt-0.5 w-20 shrink-0 text-xs font-medium text-ink-400">{r.date}</span>
                      <p dir="auto" className="flex-1 text-[13px] leading-snug text-ink-700">{r.summary}</p>
                      {r.file && (
                        <button onClick={() => openFile(r.file!.id)} className="flex max-w-full shrink-0 items-center gap-1.5 rounded-full sm:max-w-[220px] bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100" title={r.locator ?? ''}>
                          <Eye size={13} /><span className="truncate">{r.file.name}</span>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {FEATURES.overrides && !item.insufficient && (
              <details className="rounded-2xl border border-brand-100 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-brand-700">Change this priority by hand</summary>
                <div className="mt-3"><OverrideBox item={item} /></div>
              </details>
            )}
          </div>
        )}

        {tab === 'Data sources' && (
          <div className={`grid h-full gap-4 lg:min-h-[480px] ${compact ? '' : 'lg:grid-cols-[320px_1fr]'}`}>
            <div className={`thin-scroll space-y-4 overflow-y-auto pr-1 ${compact ? 'max-h-60' : ''} ${!wide && sel ? 'hidden' : ''}`}>
              {!files && <div className="h-40 animate-pulse rounded-2xl bg-brand-50" />}
              {Object.entries(grouped).map(([sec, fs]) => (
                <div key={sec}>
                  <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{tx('sec', sec, SECTION_LABEL[sec] ?? sec)}</p>
                  <div className="space-y-1.5">
                    {fs.map((f) => (
                      <button key={f.id} onClick={() => setSel(f.id)} className={`flex w-full items-start gap-2.5 rounded-2xl border p-3 text-start transition ${sel === f.id ? 'border-brand-500 bg-brand-50 shadow-float' : 'border-brand-100 bg-surface hover:border-brand-300'}`}>
                        <FileIcon f={f} />
                        <div className="min-w-0 flex-1">
                          <p dir="auto" className="break-words text-[13px] font-semibold text-ink-900 sm:truncate">{f.name}</p>
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
            <div className={`min-h-[420px] min-w-0 lg:min-h-[480px] ${!wide && !sel ? 'hidden' : ''}`}>
              {!wide && sel && <button onClick={() => setSel(null)} className="mb-3 text-sm font-semibold text-brand-700 underline">← All files</button>}
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
          <motion.div className="fixed inset-0 z-[59] bg-ink-900/25 backdrop-blur-[2px] sm:z-40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-label={item.name} className="fixed inset-x-0 bottom-0 top-10 z-[60] mx-auto flex max-w-6xl flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-panel sm:inset-x-6 sm:bottom-6 sm:top-6 sm:z-50 sm:rounded-[28px]"
            initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.98 }} transition={{ type: 'spring', stiffness: 300, damping: 30 }}>
            <DetailBody item={item} onClose={onClose} />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
