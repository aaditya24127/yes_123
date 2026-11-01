'use client';
import { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Camera, CheckCircle2, ChevronLeft, FileUp, Paperclip, Send, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useHome, fmtAgo, fmtDate } from '@/lib/hooks';
import Shell from '@/components/Shell';
import { Badge, Button, Card } from '@/components/ui';

const HINT: Record<string, string> = {
  marks: 'Upload the marks sheet (Excel, CSV, PDF) or a clear photo of it.', attendance: 'Upload the attendance sheet or a photo of the register.',
  syllabus_plan: 'Upload your syllabus or year plan.', lesson_plan: 'Upload your lesson plan.', lesson_recording: 'Upload a recording of a lesson (audio file).',
  student_work: 'Upload photos of student work.', reflection: 'Write a short note about how things are going, or upload it.', visit_notice: 'Please confirm that you have seen this notice.',
};

function Task() {
  const id = useSearchParams().get('id');
  const { data, error, reload } = useHome();
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);

  if (!data) return <Shell home={null} error={error}><p className="py-20 text-center text-ink-500">Loading…</p></Shell>;
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return <Shell home={data} error={error}><Link href="/" className="text-brand-700">Back to tasks</Link><p className="py-16 text-center text-ink-500">This task was not found.</p></Shell>;

  const notice = t.kind === 'visit_notice';
  const late = t.status === 'open' && !!t.due_date && new Date(`${t.due_date}T23:59:59`) < new Date();
  const add = (list: FileList | null) => { if (list) setFiles((f) => [...f, ...Array.from(list)]); };

  const send = async (note: string) => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api.submit(t.id, note, files);
      setFiles([]); setText('');
      setMsg(r.files ? `Sent ${r.files} file${r.files === 1 ? '' : 's'} to your CRP. Thank you!` : 'Sent to your CRP. Thank you!');
      await reload();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send. Please try again.'); }
    setBusy(false);
  };

  return (
    <Shell home={data} error={error}>
      <Link href="/" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><ChevronLeft size={16} />All tasks</Link>
      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={t.status === 'open' ? (late ? 'late' : 'open') : t.status}>{t.status === 'open' ? (late ? 'Overdue' : 'To do') : t.status === 'accepted' ? 'Accepted' : 'Sent'}</Badge>
          <span className="text-sm text-ink-500">{data.kinds[t.kind] ?? t.kind}</span>
        </div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t.title}</h1>
        {t.message && <p className="mt-2 whitespace-pre-wrap text-ink-700">{t.message}</p>}
        <p className="mt-3 text-sm text-ink-500">Asked {fmtAgo(t.created_at)}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}{t.visit_date ? ` · visit on ${fmtDate(t.visit_date)}` : ''}</p>
      </Card>

      {t.status !== 'open' && (
        <Card className="mt-4">
          <p className="flex items-center gap-2 font-semibold text-ink-900"><CheckCircle2 size={18} className="text-brand-600" />{t.status === 'accepted' ? 'Your CRP accepted this. Thank you!' : 'You sent this. Your CRP will look at it.'}</p>
          {t.response_text && <p className="mt-2 whitespace-pre-wrap rounded-2xl bg-page p-3 text-sm text-ink-700">{t.response_text}</p>}
          {t.responded_at && <p className="mt-2 text-xs text-ink-400">Sent {fmtAgo(t.responded_at)}</p>}
        </Card>
      )}

      {t.status !== 'accepted' && (
        <Card className="mt-4">
          <h2 className="font-serif text-lg font-semibold text-ink-900">{t.status === 'open' ? 'Your reply' : 'Send more'}</h2>
          <p className="mb-3 text-sm text-ink-500">{HINT[t.kind] ?? 'Add what your CRP asked for.'}</p>
          {!notice && (
            <>
              <input ref={pick} type="file" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="soft" onClick={() => pick.current?.click()}><FileUp size={16} />Choose files</Button>
                <Button type="button" variant="soft" onClick={() => cam.current?.click()}><Camera size={16} />Take a photo</Button>
              </div>
              {files.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-2xl bg-page px-3 py-2 text-sm"><Paperclip size={14} className="shrink-0 text-brand-500" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span><span className="shrink-0 text-xs text-ink-400">{(f.size / 1048576).toFixed(1)} MB</span>
                      <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-ink-400 hover:text-red-600"><X size={16} /></button></li>))}
                </ul>
              )}
            </>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={notice ? 2 : 4} placeholder={notice ? 'Optional note' : 'Add a note for your CRP (optional)'}
            className="mt-3 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
          {err && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}
          {msg && <p role="status" className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</p>}
          <Button className="mt-4 w-full" busy={busy} disabled={!notice && !files.length && !text.trim()} onClick={() => send(notice && !text.trim() ? 'I have seen this notice.' : text)}>
            <Send size={16} />{notice ? 'I have seen this' : 'Send to my CRP'}</Button>
        </Card>
      )}
    </Shell>
  );
}

export default function TaskPage() {
  return <Suspense fallback={null}><Task /></Suspense>;
}
