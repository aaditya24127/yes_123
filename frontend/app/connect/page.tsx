'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Bell, CalendarClock, Copy, Link2, Send, Unlink } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import TextbookPanel from '@/components/TextbookPanel';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Select, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { REQUEST_KINDS } from '@/lib/app.config';
import { useLoad, usePoll } from '@/lib/hooks';
import { copyText, shareUrl } from '@/lib/platform';
import ExtLink from '@/components/ui/ExtLink';
import type { ConnectRow } from '@/lib/types';

const KIND: Record<string, string> = {
  visit_notice: 'Tell them about a visit', marks: 'Send student marks / test results', attendance: 'Send attendance', syllabus_plan: 'Share syllabus / year plan',
  lesson_plan: 'Share a lesson plan', lesson_recording: 'Record and send a lesson', student_work: 'Send photos of student work', reflection: 'Write a short self-reflection', other: 'Something else',
};
const IDEAS = [
  'Send a visit notice 2–3 days ahead so the teacher keeps marks, attendance and the lesson plan ready.',
  'Ask for a short lesson recording between visits: you can evaluate it from the Visit page without travelling.',
  'Ask for test results right after each unit test; they go straight into the upload sorting.',
  'A monthly self-reflection (“what worked, what was hard”) keeps the conversation going between visits.',
];

export default function ConnectPage() {
  const rows = useLoad(() => api.connect.overview(), []);
  const notices = useLoad(() => api.connect.notifications(), []);
  usePoll(true, () => { rows.reload(); notices.reload(); });
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<ConnectRow | null>(null);
  const list = useMemo(() => (rows.data ?? []).filter((r) => !q || `${r.full_name} ${r.school_name} ${r.school_code}`.toLowerCase().includes(q.toLowerCase())), [rows.data, q]);
  useEffect(() => { if (sel) setSel(rows.data?.find((r) => r.id === sel.id) ?? sel); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [rows.data]);
  const unread = (notices.data ?? []).filter((n) => !n.read_at);

  return (
    <PageShell wide title="Teachers" subtitle="Stay in touch between visits: ask for marks, plans or a lesson recording, announce visits, and chat. Each teacher answers from a private link on their phone.">
      {unread.length > 0 && (
        <Card title={<span className="flex items-center gap-2"><Bell size={18} className="text-brand-600" />New ({unread.length})</span>}
          action={<Button variant="ghost" onClick={async () => { await api.connect.readAll(); notices.reload(); }}>Mark all read</Button>}>
          <ul className="space-y-1.5 text-sm">{unread.slice(0, 8).map((n) => (
            <li key={n.id} className="flex gap-2"><span className="text-ink-400">{new Date(n.created_at).toLocaleString()}</span><b>{n.title}</b><span className="truncate text-ink-500">{n.body}</span>
              {n.link && <Link href={n.link} className="ms-auto shrink-0 text-brand-700 underline">Open</Link>}</li>))}</ul>
        </Card>
      )}
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card title="All teachers" className="self-start">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search teacher or school" />
          <ul className="thin-scroll mt-3 max-h-[70vh] space-y-1 overflow-y-auto pe-1">
            {list.map((r) => (
              <li key={r.id}><button onClick={() => setSel(r)} className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-start text-sm transition ${sel?.id === r.id ? 'bg-brand-600 text-white' : 'hover:bg-brand-50'}`}>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.title} {r.full_name}</span><span className={`block truncate text-xs ${sel?.id === r.id ? 'text-white/80' : 'text-ink-500'}`}>{r.school_code} · {r.school_name}</span></span>
                {r.unread > 0 && <Badge tone="bad">{r.unread}</Badge>}{r.submitted > 0 && <Badge tone="good">{r.submitted} sent</Badge>}{r.open_requests > 0 && <Badge tone="warn">{r.open_requests} open</Badge>}
              </button></li>
            ))}
          </ul>
        </Card>
        {sel ? <TeacherPanel key={sel.id} row={sel} onChange={() => rows.reload()} /> : (
          <Card title="Ideas so the CRP does not depend on visits"><ul className="list-disc space-y-2 ps-5 text-sm text-ink-700">{IDEAS.map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="mt-4 text-sm text-ink-500">Pick a teacher on the left to start.</p></Card>
        )}
      </div>
    </PageShell>
  );
}

function TeacherPanel({ row, onChange }: { row: ConnectRow; onChange: () => void }) {
  const reqs = useLoad(() => api.connect.requests({ teacher_id: row.id }), [row.id]);
  const msgs = useLoad(() => api.connect.messages(row.id), [row.id]);
  usePoll(true, () => { msgs.reload(); reqs.reload(); });
  const [form, setForm] = useState({ kind: 'marks', message: '', due_date: '', visit_date: '', whole_school: false });
  const [text, setText] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');
  const run = async (k: string, fn: () => Promise<void>) => { setBusy(k); setError(''); setOk(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };
  const fullLink = link ? shareUrl(link) : '';

  return (
    <div className="space-y-5">
      <ErrorNote error={error} onClose={() => setError('')} />
      <Card title={`${row.title} ${row.full_name}`} subtitle={`${row.designation} · ${row.school_name}`}
        action={<div className="flex gap-2">
          <Button variant="soft" icon={<Link2 size={15} />} busy={busy === 'link'} onClick={() => run('link', async () => { const r = await api.connect.link(row.id); setLink(r.path); onChange(); })}>{row.has_link ? 'Show link' : 'Create private link'}</Button>
          {row.has_link && <Button variant="ghost" icon={<Unlink size={15} />} onClick={() => run('stop', async () => { await api.connect.stopLink(row.id); setLink(null); onChange(); })}>Switch off</Button>}
        </div>}>
        {link && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-brand-50 p-3 text-sm">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{fullLink}</span>
            <Button variant="soft" className="px-3 py-1.5" icon={<Copy size={14} />} onClick={() => copyText(fullLink)}>Copy</Button>
            <ExtLink href={fullLink} className="text-brand-700 underline">Open as teacher</ExtLink>
            <p className="w-full text-xs text-ink-500">Send this link to the teacher yourself (for example on WhatsApp). Anyone with the link can see this teacher&apos;s requests, so switch it off if it is shared by mistake.</p>
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Ask for something">
          <div className="grid gap-3">
            <Field label="What"><Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>{REQUEST_KINDS.map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</Select></Field>
            {form.kind === 'visit_notice'
              ? <Field label="Visit date"><Input type="date" value={form.visit_date} onChange={(e) => setForm({ ...form, visit_date: e.target.value })} /></Field>
              : <Field label="By (optional)"><Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>}
            <Field label="Message (optional)"><TextArea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={3}
              placeholder={form.kind === 'visit_notice' ? 'Please keep Class 4 marks and your lesson plan ready.' : 'Please send the first unit test marks for Class 3.'} /></Field>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.whole_school} onChange={(e) => setForm({ ...form, whole_school: e.target.checked })} className="h-4 w-4" />Send to all teachers of {row.school_name}</label>
            <div className="flex items-center gap-3">
              <Button icon={form.kind === 'visit_notice' ? <CalendarClock size={16} /> : <Send size={16} />} busy={busy === 'req'} disabled={form.kind === 'visit_notice' && !form.visit_date}
                onClick={() => run('req', async () => {
                  const r = await api.connect.request({ kind: form.kind, message: form.message || undefined, due_date: form.due_date || undefined, visit_date: form.visit_date || undefined,
                    ...(form.whole_school ? { school_id: row.school_id } : { teacher_ids: [row.id] }) });
                  setOk(`Sent to ${r.created} teacher(s).`); setForm({ ...form, message: '' }); reqs.reload(); msgs.reload(); onChange();
                })}>Send</Button>
              {ok && <span className="text-sm text-emerald-700">{ok}</span>}
            </div>
          </div>
        </Card>

        <Card title="Messages">
          <div className="thin-scroll flex max-h-80 flex-col gap-2 overflow-y-auto pe-1">
            {!msgs.data?.length ? <Empty>No messages yet.</Empty> : msgs.data.map((m) => (
              <div key={m.id} className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === 'crp' ? 'self-end bg-brand-600 text-white' : m.sender === 'teacher' ? 'self-start bg-brand-50 text-ink-900' : 'self-center bg-slate-100 text-xs text-ink-500'}`}>
                {m.body}<div className={`mt-0.5 text-[10px] ${m.sender === 'crp' ? 'text-white/70' : 'text-ink-400'}`}>{new Date(m.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" onKeyDown={(e) => e.key === 'Enter' && text.trim() && run('msg', async () => { msgs.setData(await api.connect.send(row.id, text)); setText(''); })} />
            <Button busy={busy === 'msg'} disabled={!text.trim()} onClick={() => run('msg', async () => { msgs.setData(await api.connect.send(row.id, text)); setText(''); })}>Send</Button>
          </div>
        </Card>
      </div>

      <Card title="Requests">
        {!reqs.data?.length ? <Empty>No requests yet.</Empty> : (
          <ul className="divide-y divide-brand-50">
            {reqs.data.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                <span className="min-w-0 flex-1"><b>{r.title}</b>{r.due_date && <span className="text-ink-500"> · by {r.due_date}</span>}{r.visit_date && <span className="text-ink-500"> · visit {r.visit_date}</span>}
                  {r.response_text && <span className="block text-ink-500">Reply: {r.response_text}</span>}</span>
                <Badge tone={r.status === 'submitted' ? 'good' : r.status === 'accepted' ? 'brand' : r.status === 'cancelled' ? 'neutral' : 'warn'}>{r.status}</Badge>
                {r.batch_id && <Link href={`/upload?batch=${r.batch_id}`} className="text-brand-700 underline">Check files</Link>}
                {r.status === 'submitted' && <Button variant="soft" className="px-3 py-1" onClick={() => run('acc', async () => { await api.connect.setRequest(r.id, 'accepted'); reqs.reload(); })}>Accept</Button>}
                {r.status === 'open' && <Button variant="ghost" className="px-3 py-1" onClick={() => run('can', async () => { await api.connect.setRequest(r.id, 'cancelled'); reqs.reload(); })}>Cancel</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <TextbookPanel teacherId={row.id} schoolId={row.school_id} />
    </div>
  );
}
