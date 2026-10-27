'use client';
// The teacher's private page (opened from the link the CRP sends: /teacher?k=<code>). Phone-first: requests, upload, messages.
// A fixed address with the code after "?" (not /t/<code>) so the same page also works inside the Android / iOS app.
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, CheckCircle2, Paperclip, Send } from 'lucide-react';
import { Badge, Button, Card, Empty, ErrorNote, Input, Spinner, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad, usePoll } from '@/lib/hooks';
import type { TRequest } from '@/lib/types';

export default function Page() {
  return <Suspense fallback={null}><TeacherPage /></Suspense>;
}

function TeacherPage() {
  const token = useSearchParams().get('k') ?? '';
  const home = useLoad(() => api.teacher.home(token), [token]);
  usePoll(!!home.data, () => home.reload());
  const [text, setText] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };

  if (!token) return <main className="mx-auto max-w-lg p-6"><ErrorNote error="This link is incomplete. Please open the full link your CRP sent." /></main>;
  if (home.error) return <main className="mx-auto max-w-lg p-6"><ErrorNote error={home.error} /></main>;
  if (!home.data) return <main className="mx-auto max-w-lg p-6"><Spinner label="Loading…" /></main>;
  const d = home.data;
  const open = d.requests.filter((r) => r.status === 'open');
  const done = d.requests.filter((r) => r.status !== 'open');

  return (
    <main className="mx-auto max-w-lg space-y-4 px-4 pb-16 pt-6">
      <header>
        <p className="text-sm text-ink-500">{d.teacher.school}</p>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">Namaste, {d.teacher.name}</h1>
      </header>
      <ErrorNote error={error} onClose={() => setError('')} />
      {d.upcoming_visit && (
        <div className="flex items-start gap-3 rounded-3xl bg-brand-600 p-4 text-white shadow-float">
          <CalendarClock size={22} className="shrink-0" />
          <div><p className="font-semibold">CRP visit on {new Date(d.upcoming_visit.visit_date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</p>
            {d.upcoming_visit.message && <p className="text-sm text-white/85">{d.upcoming_visit.message}</p>}</div>
        </div>
      )}
      <Card title={`To do (${open.length})`}>
        {!open.length ? <Empty>Nothing pending. Thank you!</Empty> : <div className="space-y-3">{open.map((r) => <RequestCard key={r.id} r={r} token={token} onDone={() => home.reload()} />)}</div>}
      </Card>
      <Card title="Send something to your CRP" subtitle="Marks, attendance, a lesson plan, a recording, photos of student work…">
        <RequestCard token={token} onDone={() => home.reload()} />
      </Card>
      <Card title="Messages">
        <div className="flex flex-col gap-2">
          {!d.messages.length ? <Empty>No messages yet.</Empty> : d.messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === 'teacher' ? 'self-end bg-brand-600 text-white' : 'self-start bg-brand-50 text-ink-900'}`}>
              {m.body}<div className={`mt-0.5 text-[10px] ${m.sender === 'teacher' ? 'text-white/70' : 'text-ink-400'}`}>{new Date(m.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write to your CRP" />
          <Button busy={busy === 'm'} disabled={!text.trim()} icon={<Send size={15} />} onClick={() => run('m', async () => { home.setData(await api.teacher.message(token, text)); setText(''); })}>Send</Button>
        </div>
      </Card>
      {done.length > 0 && (
        <Card title="Done">
          <ul className="space-y-1.5 text-sm">{done.map((r) => <li key={r.id} className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-600" /><span className="flex-1">{r.title}</span><Badge tone="good">{r.status}</Badge></li>)}</ul>
        </Card>
      )}
    </main>
  );
}

function RequestCard({ r, token, onDone }: { r?: TRequest; token: string; onDone: () => void }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async () => {
    setBusy(true); setMsg('');
    try { await api.teacher.submit(token, { request_id: r?.id, text: text || undefined }, files); setText(''); setFiles([]); setMsg('Sent. Thank you!'); onDone(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className={r ? 'rounded-2xl border border-brand-100 p-3' : ''}>
      {r && <><p className="font-semibold text-ink-900">{r.title}</p>{r.message && <p className="text-sm text-ink-500">{r.message}</p>}{r.due_date && <p className="text-xs text-amber-700">By {r.due_date}</p>}</>}
      {r?.kind !== 'visit_notice' && (
        <div className="mt-2 space-y-2">
          <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder={r?.kind === 'reflection' ? 'What worked well this month? What was hard?' : 'Add a note (optional)'} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-2xl bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 ring-1 ring-brand-100">
              <Paperclip size={15} />Attach files<input type="file" multiple className="hidden" accept="image/*,audio/*,.pdf,.xlsx,.csv,.docx,.txt" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </label>
            {files.length > 0 && <span className="text-xs text-ink-500">{files.length} file(s)</span>}
            <Button className="ms-auto" busy={busy} disabled={!text.trim() && !files.length} onClick={send}>Send</Button>
          </div>
          {msg && <p className="text-xs text-ink-500">{msg}</p>}
        </div>
      )}
    </div>
  );
}
