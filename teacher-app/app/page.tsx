'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { BellRing, CalendarClock, CheckCircle2, ChevronRight, ClipboardList, Clock, Send } from 'lucide-react';
import { useHome, fmtAgo, fmtDate } from '@/lib/hooks';
import type { Task } from '@/lib/api';
import Shell from '@/components/Shell';
import { Badge, Button, Card, Empty } from '@/components/ui';

const isLate = (t: Task) => t.status === 'open' && !!t.due_date && new Date(`${t.due_date}T23:59:59`) < new Date();

function TaskRow({ t, kinds }: { t: Task; kinds: Record<string, string> }) {
  const late = isLate(t);
  return (
    <Link href={`/task?id=${t.id}`} className="flex items-center gap-3 rounded-3xl bg-surface p-4 shadow-float ring-1 ring-brand-100 transition hover:ring-brand-300">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${t.status === 'open' ? 'bg-amber-50 text-amber-700' : 'bg-brand-50 text-brand-600'}`}>
        {t.status === 'open' ? <ClipboardList size={20} /> : t.status === 'accepted' ? <CheckCircle2 size={20} /> : <Send size={20} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{t.title}</p>
        <p className="truncate text-sm text-ink-500">{kinds[t.kind] ?? t.kind}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ''}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {t.status === 'open' ? <Badge tone={late ? 'late' : 'open'}>{late ? 'Overdue' : 'To do'}</Badge> : <Badge tone={t.status}>{t.status === 'accepted' ? 'Accepted' : 'Sent'}</Badge>}
        <ChevronRight size={16} className="text-ink-400" />
      </div>
    </Link>
  );
}

export default function Home() {
  const { data, error } = useHome();
  const [perm, setPerm] = useState<string>('granted');
  useEffect(() => { if (typeof Notification !== 'undefined') setPerm(Notification.permission); }, []);

  if (!data) return <Shell home={null} error={error}><p className="py-20 text-center text-ink-500">Loading…</p></Shell>;
  const open = data.tasks.filter((t) => t.status === 'open');
  const sent = data.tasks.filter((t) => t.status === 'submitted');
  const done = data.tasks.filter((t) => t.status === 'accepted');
  const fresh = data.notifications.filter((n) => !n.read_at).slice(0, 3);
  const first = data.teacher.name.split(' ').slice(0, 2).join(' ');

  return (
    <Shell home={data} error={error}>
      <div className="mb-5 mt-1">
        <h1 className="font-serif text-2xl font-semibold text-ink-900 sm:text-3xl">Hello, {first}</h1>
        <p className="text-sm text-ink-500">{data.teacher.school}{data.teacher.classes?.length ? ` · Class ${data.teacher.classes.join(', ')}` : ''}</p>
      </div>

      {data.upcoming_visit && (
        <Card className="mb-4 flex items-start gap-3 !bg-brand-700 !text-white">
          <CalendarClock size={22} className="mt-0.5 shrink-0" />
          <div><p className="font-semibold">Your CRP will visit on {fmtDate(data.upcoming_visit.visit_date)}</p>
            {data.upcoming_visit.message && <p className="mt-0.5 text-sm text-brand-100">{data.upcoming_visit.message}</p>}</div>
        </Card>
      )}

      {perm === 'default' && (
        <Card className="mb-4 flex items-center gap-3">
          <BellRing size={22} className="shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-ink-700">Turn on alerts to be told when your CRP sends something new.</p>
          <Button variant="soft" className="!px-4 !py-2" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</Button>
        </Card>
      )}

      {fresh.length > 0 && (
        <Card className="mb-5">
          <div className="mb-2 flex items-center justify-between"><h2 className="font-serif text-lg font-semibold text-ink-900">New for you</h2><Link href="/updates" className="text-sm font-semibold text-brand-700">See all</Link></div>
          <ul className="space-y-2.5">
            {fresh.map((n) => (
              <li key={n.id} className="flex gap-3"><span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-400" />
                <div className="min-w-0"><p className="font-semibold text-ink-900">{n.title}</p>{n.body && <p className="line-clamp-2 text-sm text-ink-500">{n.body}</p>}<p className="text-xs text-ink-400">{fmtAgo(n.created_at)}</p></div></li>))}
          </ul>
        </Card>
      )}

      <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900">To do <Badge tone="open">{open.length}</Badge></h2>
      {open.length ? <div className="space-y-3">{open.map((t) => <TaskRow key={t.id} t={t} kinds={data.kinds} />)}</div>
        : <Empty icon={<CheckCircle2 size={34} />} title="You are all caught up" hint="When your CRP asks for something, it will appear here." />}

      {sent.length > 0 && (<><h2 className="mb-2 mt-7 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900"><Clock size={18} className="text-brand-500" />Sent, waiting for your CRP</h2>
        <div className="space-y-3">{sent.map((t) => <TaskRow key={t.id} t={t} kinds={data.kinds} />)}</div></>)}
      {done.length > 0 && (<><h2 className="mb-2 mt-7 font-serif text-lg font-semibold text-ink-900">Done</h2>
        <div className="space-y-3">{done.map((t) => <TaskRow key={t.id} t={t} kinds={data.kinds} />)}</div></>)}
    </Shell>
  );
}
