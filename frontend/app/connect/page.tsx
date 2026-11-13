'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell, Send, TriangleAlert } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import TextbookPanel from '@/components/TextbookPanel';
import TaskComposer from '@/components/TaskComposer';
import TaskReview from '@/components/TaskReview';
import DatePrompt from '@/components/ui/DatePrompt';
import { fmtDay } from '@/lib/visit-text';
import { Badge, Button, Card, Empty, ErrorNote, Input } from '@/components/ui';
import { api } from '@/lib/api';
import { useLoad, usePoll } from '@/lib/hooks';
import type { ConnectRow } from '@/lib/types';

const IDEAS = [
  'Send a visit notice 2–3 days ahead, and give numbered tasks (Task 1 marks, Task 2 attendance ...) so the teacher knows exactly what to prepare.',
  'Ask for lesson plans or photos of student work between visits, so you can see what is happening without travelling.',
  'Ask for test results right after each unit test; they go straight into the upload sorting.',
  'A monthly self-reflection (“what worked, what was hard”) keeps the conversation going between visits.',
];

export default function ConnectPage() {
  const rows = useLoad(() => api.connect.overview(), []);
  const notices = useLoad(() => api.connect.notifications(), []);
  usePoll(true, () => { rows.reload(); notices.reload(); }, 10000);     // new messages and answers show up within 10 seconds
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ConnectRow | null>(null);
  const list = useMemo(() => (rows.data ?? []).filter((r) => !q || `${r.full_name} ${r.school_name} ${r.school_code}`.toLowerCase().includes(q.toLowerCase())), [rows.data, q]);
  useEffect(() => { if (sel) setSel(rows.data?.find((r) => r.id === sel.id) ?? sel); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rows.data]);
  const unread = (notices.data ?? []).filter((n) => !n.read_at);

  return (
    <PageShell wide title="Teachers" subtitle="Pick a teacher to give tasks, announce a visit or send a message. Teachers see everything in their own app and send things back from there.">
      {unread.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><Bell size={18} className="text-brand-600" />New ({unread.length})</span>}
          action={<Button variant="ghost" onClick={async () => { await api.connect.readAll(); notices.reload(); }}>Mark all read</Button>}>
          <ul className="space-y-1.5 text-sm">{unread.slice(0, 8).map((n) => (
            <li key={n.id} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 sm:flex-nowrap"><span className="text-xs text-ink-400 sm:text-sm">{new Date(n.created_at).toLocaleString()}</span><b>{n.title}</b><span className="min-w-0 basis-full truncate text-ink-500 sm:basis-auto">{n.body}</span>
              {n.link && <Link href={n.link} className="ms-auto shrink-0 text-brand-700 underline">Open</Link>}</li>))}</ul>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card tour="t-list" title="All teachers" className={`self-start ${sel ? 'hidden lg:block' : ''}`}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teacher or school" />
          <ul className="thin-scroll mt-3 max-h-[70vh] space-y-1 overflow-y-auto pe-1">
            {list.map((r) => (
              <li key={r.id}><button onClick={() => setSel(r)} data-tour="t-item" className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-start text-sm transition ${sel?.id === r.id ? 'bg-brand-600 text-white' : 'hover:bg-brand-50'}`}>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.title} {r.full_name}</span><span className={`block truncate text-xs ${sel?.id === r.id ? 'text-white/80' : 'text-ink-500'}`}>{r.school_code} · {r.school_name}</span></span>
                {r.unread > 0 && <Badge tone="bad">{r.unread}</Badge>}{r.submitted > 0 && <Badge tone="good">{r.submitted} sent</Badge>}{r.open_requests > 0 && <Badge tone="warn">{r.open_requests} open</Badge>}
              </button></li>
            ))}
          </ul>
        </Card>
        {sel ? <TeacherPanel key={sel.id} row={sel} onChange={() => rows.reload()} onBack={() => setSel(null)} /> : (
          <Card title="Ideas so the CRP does not depend on visits"><ul className="list-disc space-y-2 ps-5 text-sm text-ink-700">{IDEAS.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-4 text-sm text-ink-500">Pick a teacher from the list to start.</p></Card>
        )}
      </div>
    </PageShell>
  );
}

function TeacherPanel({ row, onChange, onBack }: { row: ConnectRow; onChange: () => void; onBack: () => void }) {
  const reqs = useLoad(() => api.connect.requests({ teacher_id: row.id }), [row.id]);
  const msgs = useLoad(() => api.connect.messages(row.id), [row.id]);
  usePoll(true, () => { msgs.reload(); reqs.reload(); }, 8000);
  const top = useRef<HTMLDivElement>(null);
  useEffect(() => { if (window.innerWidth < 1024) top.current?.scrollIntoView({ block: 'start' }); }, []);     // on a phone the list is replaced by this panel
  const [text, setText] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setError(''); setOk(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };

  return (
    <div ref={top} className="scroll-mt-4 space-y-5">
      <button onClick={onBack} className="text-sm font-semibold text-brand-700 underline lg:hidden">← All teachers</button>
      <ErrorNote error={error} onClose={() => setError('')} />
      <Card title={`${row.title} ${row.full_name}`} subtitle={`${row.designation} · ${row.school_name}`}>
        <p className="text-sm text-ink-500">Teacher&apos;s email: <span className="text-ink-700">{row.email}</span></p>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <TaskComposer row={row} onSent={() => { reqs.reload(); msgs.reload(); onChange(); }} onError={setError} />

        <Card tour="t-messages" title="Messages">
          <div className="thin-scroll flex max-h-80 flex-col gap-2 overflow-y-auto pe-1">
            {!msgs.data?.length ? <Empty>No messages yet.</Empty> : msgs.data.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === 'crp' ? 'self-end bg-brand-600 text-white' : m.sender === 'teacher' ? 'self-start bg-brand-50 text-ink-900' : 'self-center bg-slate-100 text-xs text-ink-500'}`}>
                {m.is_concern && <div className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-700"><TriangleAlert size={11} />Concern</div>}
                {m.body}<div className={`mt-0.5 text-[10px] ${m.sender === 'crp' ? 'text-white/70' : 'text-ink-400'}`}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" onKeyDown={(e) => e.key === 'Enter' && text.trim() && setAsking(true)} />
            <Button disabled={!text.trim()} onClick={() => setAsking(true)}>Send</Button>
          </div>
          <DatePrompt open={asking} busy={busy === 'msg'} title="Reply by which date?" question="By which date should the teacher reply to this message?" confirmLabel="Send message" onClose={() => setAsking(false)}
            onConfirm={(d) => run('msg', async () => { msgs.setData(await api.connect.send(row.id, `${text.trim()}

Please reply by ${fmtDay(d)}.`)); setText(''); setAsking(false); })} />
        </Card>
      </div>

      <TaskReview requests={reqs.data} onChange={() => { reqs.reload(); onChange(); }} onError={setError} />
      <TextbookPanel teacherId={row.id} schoolId={row.school_id} />
    </div>
  );
}
