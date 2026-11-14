'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '@/lib/api';
import type { FileInfo, Preview } from '@/lib/types';
import { useLang } from '@/lib/i18n';
import ExtLink from './ui/ExtLink';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

function rowSet(preview: Preview, sheet: string, single: boolean): Set<number> {
  const out = new Set<number>();
  for (const h of preview.highlights) {
    if (!h.locator) continue;
    const m = h.locator.match(/^Sheet '(.+)', row (\d+)$/) || h.locator.match(/^row (\d+)$/);
    if (!m) continue;
    if (m.length === 3 && m[1] !== sheet) continue;
    out.add(Number(m[m.length - 1]));
  }
  return out;
}

function Sheets({ preview }: { preview: Preview }) {
  const { t , tr } = useLang();
  const [tab, setTab] = useState(0);
  const sheet = preview.sheets![tab];
  const hl = useMemo(() => rowSet(preview, sheet.name, preview.sheets!.length === 1), [preview, sheet]);
  const first = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => { first.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [tab, preview.id]);
  let firstSet = false;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {preview.sheets!.length > 1 && (
        <div className="mb-2 flex gap-1.5">
          {preview.sheets!.map((s, i) => (
            <button key={s.name} onClick={() => setTab(i)} className={`rounded-full px-3 py-1 text-xs font-semibold ${i === tab ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}>{tr(s.name)}</button>
          ))}
        </div>
      )}
      <div className="thin-scroll min-h-0 flex-1 overflow-auto rounded-2xl border border-brand-100">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {sheet.rows.map((r, i) => {
              const n = i + 1; const on = hl.has(n);
              const ref = on && !firstSet ? ((firstSet = true), first) : undefined;
              return (
                <tr key={i} ref={ref} className={on ? 'bg-brand-100/70' : i % 2 ? 'bg-surface' : 'bg-brand-50/30'}>
                  <td className={`sticky left-0 w-9 border-r border-brand-100 px-2 py-1.5 text-right tabular-nums ${on ? 'bg-brand-600 font-semibold text-white' : 'bg-brand-50 text-ink-400'}`}>{n}</td>
                  {r.map((c, j) => <td key={j} className="whitespace-nowrap border-b border-brand-50 px-3 py-1.5 text-ink-700">{tr(c)}</td>)}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hl.size > 0 && <p className="mt-2 text-xs text-ink-500"><span className="me-1 inline-block h-2.5 w-2.5 rounded-sm bg-brand-600" />{t('highlighted')}</p>}
    </div>
  );
}

function blocks(text: string): string[] {
  const out: string[] = []; let cur = '';
  for (const line of text.split('\n')) {
    if (!line.trim()) { if (cur) out.push(cur); cur = ''; continue; }
    if (/^(- |\* )/.test(line) || /^#/.test(line)) { if (cur) out.push(cur); cur = line; }
    else cur = cur ? `${cur} ${line.trim()}` : line;
  }
  if (cur) out.push(cur);
  return out;
}

function Paragraphs({ items, highlights }: { items: string[]; highlights: Preview['highlights'] }) {
  const { tr } = useLang();
  const keys = useMemo(() => highlights.map((h) => (h.text ? norm(h.text).split(' [concern level')[0].slice(0, 70) : '')).filter(Boolean), [highlights]);
  const first = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => { first.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [items]);
  let firstSet = false;
  return (
    <div className="thin-scroll h-full space-y-2 overflow-auto rounded-2xl border border-brand-100 bg-surface p-5 text-sm leading-relaxed text-ink-700">
      {items.map((p, i) => {
        const on = keys.some((k) => norm(p).includes(k));
        const ref = on && !firstSet ? ((firstSet = true), first) : undefined;
        return <p key={i} ref={ref} className={on ? 'rounded-xl border-l-4 border-brand-600 bg-brand-50 px-3 py-2' : 'px-3 py-1'}>{tr(p)}</p>;
      })}
    </div>
  );
}

function Audio({ src, duration }: { src: string; duration: number | null }) {
  const { t } = useLang();
  const ref = useRef<HTMLAudioElement>(null); const [rate, setRate] = useState(1);
  useEffect(() => { if (ref.current) ref.current.playbackRate = rate; }, [rate]);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 rounded-2xl border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-8">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v18M8 8v8M4 11v2M16 7v10M20 10v4" /></svg>
      </div>
      {duration && <p className="text-sm text-ink-500">{t('recording', { m: Math.floor(duration / 60), s: Math.round(duration % 60) })}</p>}
      <audio ref={ref} controls src={src} className="w-full max-w-xl" onLoadedMetadata={() => { if (ref.current) ref.current.playbackRate = rate; }} />
      <div className="flex flex-wrap justify-center gap-2">
        {[0.5, 1, 1.5, 2, 3].map((r) => (
          <button key={r} onClick={() => setRate(r)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${rate === r ? 'bg-brand-600 text-white shadow-float' : 'bg-surface text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50'}`}>{r}×</button>
        ))}
      </div>
    </div>
  );
}

export default function DataViewer({ file }: { file: FileInfo }) {
  const { t , tr } = useLang();
  const [p, setP] = useState<Preview | null>(null); const [err, setErr] = useState('');
  useEffect(() => {
    setP(null); setErr('');
    api.preview(file.id).then(setP).catch((e) => setErr(String(e.message || e)));
  }, [file.id]);
  const raw = api.rawUrl(file.id);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{tr(file.name)}</p>
          <p className="text-xs text-ink-500">{file.format.toUpperCase()} · {tr(file.record_date)}{file.scanned ? ` · ${t('scanned')}` : ''}</p>
        </div>
        <ExtLink href={raw} className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"><ExternalLink size={13} /> {t('openOriginal')}</ExtLink>
      </div>
      <div className="min-h-0 flex-1">
        {err && <p className="text-sm text-red-600">{tr(err)}</p>}
        {!p && !err && <div className="h-full animate-pulse rounded-2xl bg-brand-50" />}
        {p?.view === 'sheets' && <Sheets preview={p} />}
        {p?.view === 'doc' && <Paragraphs items={[...(p.paragraphs ?? []), ...(p.tables ?? []).flatMap((t) => t.map((r) => r.join('  |  ')))]} highlights={p.highlights} />}
        {p?.view === 'text' && <Paragraphs items={blocks(p.text ?? '')} highlights={p.highlights} />}
        {p?.view === 'pdf' && <div className="thin-scroll h-full space-y-3 overflow-auto rounded-2xl border border-brand-100 bg-brand-50/50 p-3">{Array.from({ length: p.pages ?? 1 }).map((_, i) => <img key={i} src={api.pageUrl(file.id, i + 1)} alt={tr('Page {x}', { x: i + 1 })} className="mx-auto w-full max-w-3xl rounded-lg bg-surface shadow-float" />)}</div>}
        {p?.view === 'image' && <div className="thin-scroll h-full overflow-auto rounded-2xl border border-brand-100 bg-surface p-3"><img src={raw} alt={tr(file.name)} className="mx-auto max-w-full rounded-lg" /></div>}
        {p?.view === 'audio' && <Audio src={raw} duration={file.duration} />}
      </div>
    </div>
  );
}

