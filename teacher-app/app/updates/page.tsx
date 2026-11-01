'use client';
import { useEffect, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { useHome, fmtAgo } from '@/lib/hooks';
import Shell from '@/components/Shell';
import { Button, Card, Empty, Title } from '@/components/ui';

export default function Updates() {
  const { data, error, reload } = useHome();
  const [perm, setPerm] = useState('granted');
  useEffect(() => { if (typeof Notification !== 'undefined') setPerm(Notification.permission); }, []);
  const unread = data?.unread ?? 0;
  const [firstUnread] = useState(() => new Set<string>());
  data?.notifications.forEach((n) => { if (!n.read_at) firstUnread.add(n.id); });   // keep the dots while this page is open
  useEffect(() => { if (unread > 0) api.readAll().then(reload).catch(() => undefined); }, [unread, reload]);

  return (
    <Shell home={data} error={error}>
      <Title sub="Everything your CRP has sent you.">What&apos;s new</Title>
      {perm === 'default' && (
        <Card className="mb-4 flex items-center gap-3"><BellRing size={22} className="shrink-0 text-brand-600" />
          <p className="flex-1 text-sm text-ink-700">Turn on alerts to be told when something new arrives.</p>
          <Button variant="soft" className="!px-4 !py-2" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</Button></Card>)}
      {data && data.notifications.length === 0 ? <Empty icon={<Bell size={34} />} title="Nothing yet" hint="Tasks and messages from your CRP will be listed here." /> : (
        <ul className="space-y-3">{data?.notifications.map((n) => (
          <li key={n.id} className="flex gap-3 rounded-3xl bg-surface p-4 shadow-float ring-1 ring-brand-100">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${firstUnread.has(n.id) ? 'bg-amber-400' : 'bg-brand-100'}`} />
            <div className="min-w-0"><p className="font-semibold text-ink-900">{n.title}</p>{n.body && <p className="text-sm text-ink-700">{n.body}</p>}<p className="mt-0.5 text-xs text-ink-400">{fmtAgo(n.created_at)}</p></div></li>))}</ul>)}
    </Shell>
  );
}
