'use client';
// Search official textbooks / syllabus on the web and link them to a teacher (the app downloads the PDF itself and remembers it).
import { useState } from 'react';
import { BookOpen, ExternalLink, Link2, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useLoad, usePoll } from '@/lib/hooks';
import type { TextbookHit } from '@/lib/types';
import { Badge, Button, Card, Empty, ErrorNote, Input } from './ui';
import ExtLink from './ui/ExtLink';
import { useLang } from '@/lib/i18n';

export default function TextbookPanel({ teacherId, schoolId, defaults }: {
  teacherId?: string | null; schoolId?: string | null; defaults?: { class_no?: number | null; subject?: string | null; board?: string | null; language?: string | null };
}) {
  const { tr } = useLang();
  const [q, setQ] = useState([defaults?.class_no ? tr('Class {class_no}', { class_no: defaults.class_no }) : '', defaults?.subject ?? '', defaults?.board ?? '', 'textbook'].filter(Boolean).join(' '));
  const [hits, setHits] = useState<TextbookHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const linked = useLoad(() => api.textbooks.list(teacherId ? { teacher_id: teacherId } : { school_id: schoolId ?? undefined }), [teacherId, schoolId]);
  usePoll(!!linked.data?.some((r) => r.status === 'linked' && !r.source_file_id && r.source_url?.toLowerCase().includes('.pdf')), () => linked.reload());

  const search = async () => {
    if (!q.trim()) return; setBusy(true); setError('');
    try {
      const r = await api.textbooks.search({ q, class_no: defaults?.class_no, subject: defaults?.subject ?? undefined, board: defaults?.board ?? undefined, language: defaults?.language ?? undefined });
      setHits(r.results);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const add = async (url: string, title: string, publisher?: string) => {
    try {
      await api.textbooks.add({ teacher_id: teacherId ?? undefined, school_id: schoolId ?? undefined, url, title, class_no: defaults?.class_no ?? null, subject: defaults?.subject ?? null, publisher });
      linked.reload();
    } catch (e) { setError((e as Error).message); }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><BookOpen size={18} className="text-brand-600" />{tr('Textbooks and syllabus')}</span>}
      subtitle={tr('Find the book the teacher uses and link it. The app fetches the PDF from the official site and remembers it for this teacher.')}>
      <ErrorNote error={error} onClose={() => setError('')} />
      <div className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder={tr('e.g. Class 4 Mathematics Balbharati')} />
        <Button onClick={search} busy={busy} icon={<Search size={16} />}>{tr('Search')}</Button>
      </div>
      {hits && (
        <div className="mt-3">
          {!hits.length ? <Empty>{tr('Nothing found. Try other words, or paste a link below.')}</Empty> : (
            <ul className="space-y-2">
              {hits.map((h) => (
                <li key={h.url} className="flex items-start gap-3 rounded-2xl bg-brand-50/50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{tr(h.title)}</p>
                    <p className="truncate text-xs text-ink-500">{tr(h.publisher)} · {tr(h.url)}</p>
                  </div>
                  {h.is_pdf && <Badge tone="good">{tr('PDF')}</Badge>}
                  <ExtLink href={h.url} className="rounded-full p-1.5 text-ink-400 hover:bg-brand-100" title={tr('Open')}><ExternalLink size={15} /></ExtLink>
                  <Button className="px-3 py-1.5" onClick={() => add(h.url, h.title, h.publisher)}>{tr('Link')}</Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder={tr('Or paste a link to a PDF or textbook page')} />
        <Button variant="soft" icon={<Link2 size={15} />} disabled={!manual.startsWith('http')} onClick={() => { add(manual, manual.split('/').pop() || 'Textbook'); setManual(''); }}>{tr('Link')}</Button>
      </div>
      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">{teacherId ? tr('Linked for this teacher') : tr('Linked for this school')}</p>
        {!linked.data?.length ? <p className="text-sm text-ink-400">{tr('None yet.')}</p> : (
          <ul className="space-y-1.5">
            {linked.data.map((r) => (
              <li key={r.id} className="flex items-center gap-2 text-sm">
                <BookOpen size={15} className="shrink-0 text-brand-600" />
                <ExtLink href={r.source_file_id ? api.rawUrl(r.source_file_id) : r.source_url ?? '#'} className="min-w-0 flex-1 truncate hover:text-brand-700">{tr(r.title)}</ExtLink>
                <Badge tone={r.status === 'downloaded' ? 'good' : r.status === 'failed' ? 'bad' : 'neutral'}>
                  {r.status === 'downloaded' ? `${r.pages ?? '?'} pages${r.chapters ? `, ${r.chapters} chapters` : ''}` : r.status === 'failed' ? tr('link only') : 'link'}
                </Badge>
                <button onClick={async () => { await api.textbooks.remove(r.id); linked.reload(); }} className="rounded-full p-1 text-ink-400 hover:text-red-600" aria-label={tr('Remove')}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
