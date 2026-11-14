'use client';
import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { api } from '@/lib/api';
import { useHome, fmtAgo } from '@/lib/hooks';
import Shell from '@/components/Shell';
import AlertsCard from '@/components/AlertsCard';
import { Empty, Title } from '@/components/ui';
import { useLang } from '@/lib/i18n';

export default function Updates() {
  const { tr, tn } = useLang();
  const { data, error, reload } = useHome();
  const unread = data?.unread ?? 0;
  const [firstUnread] = useState(() => new Set<string>());
  data?.notifications.forEach((n) => { if (!n.read_at) firstUnread.add(n.id); });   // keep the dots while this page is open
  useEffect(() => { if (unread > 0) api.readAll().then(reload).catch(() => undefined); }, [unread, reload]);

  return (
    <Shell home={data} error={error}>
      <Title sub="Everything your CRP has sent you.">{tr('What\'s new')}</Title>
      <AlertsCard className="mb-4" />
      {data && data.notifications.length === 0 ? <Empty icon={<Bell size={34} />} title={tr('Nothing yet')} hint={tr('Tasks and messages from your CRP will be listed here.')} /> : (
        <ul className="space-y-3">{data?.notifications.map((n) => (
          <li key={n.id} className="flex gap-3 rounded-3xl bg-surface p-4 shadow-float ring-1 ring-brand-100">
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${firstUnread.has(n.id) ? 'bg-amber-400' : 'bg-brand-100'}`} />
            <div className="min-w-0"><p className="font-semibold text-ink-900">{tn(n.title)}</p>{n.body && <p className="text-sm text-ink-700">{tn(n.body)}</p>}<p className="mt-0.5 text-xs text-ink-400">{fmtAgo(n.created_at)}</p></div></li>))}</ul>)}
    </Shell>
  );
}
