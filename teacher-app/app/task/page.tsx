'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CalendarClock, CheckCircle2, ChevronLeft, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { useHome, fmtAgo, fmtDate } from '@/lib/hooks';
import Shell from '@/components/Shell';
import TaskItemCard from '@/components/TaskItemCard';
import { Badge, Button, Card } from '@/components/ui';

function Task() {
  const id = useSearchParams().get('id');
  const { data, error, reload } = useHome();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (!data) return <Shell home={null} error={error}><p className="py-20 text-center text-ink-500">Loading…</p></Shell>;
  const t = data.tasks.find((x) => x.id === id);
  if (!t) return <Shell home={data} error={error}><Link href="/" className="text-brand-700">Back to tasks</Link><p className="py-16 text-center text-ink-500">This task was not found.</p></Shell>;

  const items = t.items;
  const done = items.filter((i) => i.status === 'accepted').length;
  const sentOrDone = items.filter((i) => i.status === 'submitted' || i.status === 'accepted').length;
  const todo = items.filter((i) => i.status === 'open' || i.status === 'rejected').length;
  const late = todo > 0 && !!t.due_date && new Date(`${t.due_date}T23:59:59`) < new Date();
  const notice = t.kind === 'visit_notice';

  const confirmNotice = async () => {
    setBusy(true); setErr('');
    try { await api.submit({ taskId: t.id }, note || 'I have seen this notice.', []); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
    setBusy(false);
  };

  return (
    <Shell home={data} error={error}>
      <Link href="/" className="-mt-2 mb-1 inline-flex items-center gap-1 py-2 pe-3 text-sm font-semibold text-brand-700"><ChevronLeft size={16} />All tasks</Link>
      <Card>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {notice ? <Badge tone={t.status === 'open' ? 'open' : 'submitted'}>{t.status === 'open' ? 'Please confirm' : 'Confirmed'}</Badge>
            : done === items.length && items.length > 0 ? <Badge tone="accepted">All done</Badge> : late ? <Badge tone="late">Overdue</Badge> : <Badge tone="open">{todo} to do</Badge>}
          {!notice && items.length > 1 && <span className="text-sm text-ink-500">{sentOrDone} of {items.length} sent · {done} accepted</span>}
        </div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{t.title}</h1>
        {t.message && <p className="mt-2 whitespace-pre-wrap text-ink-700">{t.message}</p>}
        <p className="mt-3 text-sm text-ink-500">Asked {fmtAgo(t.created_at)}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}{t.visit_date ? ` · visit on ${fmtDate(t.visit_date)}` : ''}</p>
      </Card>

      {notice ? (
        <Card className="mt-4">
          {t.status === 'open' ? (
            <>
              <p className="mb-3 flex items-center gap-2 text-sm text-ink-500"><CalendarClock size={16} />Please confirm that you have seen this notice.</p>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Optional note"
                className="w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
              {err && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}
              <Button className="mt-4 w-full" busy={busy} onClick={confirmNotice}><Send size={16} />I have seen this</Button>
            </>
          ) : <p className="flex items-center gap-2 font-semibold text-ink-900"><CheckCircle2 size={18} className="text-brand-600" />You confirmed this notice.</p>}
        </Card>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((it) => <TaskItemCard key={it.id} item={it} label={`Task ${it.position}`} onSent={reload} />)}
        </div>
      )}
    </Shell>
  );
}

export default function TaskPage() {
  return <Suspense fallback={null}><Task /></Suspense>;
}
