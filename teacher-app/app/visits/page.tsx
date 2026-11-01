'use client';
import { useEffect, useState } from 'react';
import { CalendarCheck, FileText, ListChecks } from 'lucide-react';
import { api, type Visits } from '@/lib/api';
import { useHome, fmtDate } from '@/lib/hooks';
import Shell from '@/components/Shell';
import { Badge, Card, Empty, Title } from '@/components/ui';

const TYPE: Record<string, string> = { classroom_observation: 'Classroom visit', school_visit: 'School visit', followup_visit: 'Follow-up visit', onboarding: 'First visit' };
const label = (t: string) => TYPE[t] ?? t.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default function VisitsPage() {
  const { data, error } = useHome();
  const [v, setV] = useState<Visits | null>(null);
  useEffect(() => { api.visits().then(setV).catch(() => undefined); }, []);

  return (
    <Shell home={data} error={error}>
      <Title sub="Your CRP's visits to your class and the actions you agreed together.">My visits</Title>
      {data?.upcoming_visit && <Card className="mb-4 !bg-brand-700 !text-white"><p className="font-semibold">Next visit: {fmtDate(data.upcoming_visit.visit_date)}</p></Card>}

      {v && v.reports.length > 0 && (
        <>
          <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900"><FileText size={18} className="text-brand-500" />Visit reports</h2>
          <ul className="mb-7 space-y-2.5">{v.reports.map((r) => (
            <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 rounded-3xl bg-surface px-4 py-3 shadow-float ring-1 ring-brand-100 hover:ring-brand-300">
              <span className="min-w-0"><span className="block font-semibold text-ink-900">Report for your visit on {fmtDate(r.date)}</span>
                <span className="block truncate text-sm text-ink-500">{[r.class_no ? `Class ${r.class_no}` : null, r.subject, r.topic].filter(Boolean).join(' · ') || 'Open the PDF'}</span></span>
              <span className="shrink-0 text-sm font-semibold text-brand-700">Open PDF</span></a></li>))}</ul>
        </>
      )}

      <h2 className="mb-2 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900"><CalendarCheck size={18} className="text-brand-500" />Past visits</h2>
      {v && v.visits.length === 0 ? <Empty icon={<CalendarCheck size={34} />} title="No visits recorded yet" /> : (
        <ul className="space-y-2.5">{v?.visits.map((x, i) => (
          <li key={i} className="flex items-center justify-between rounded-3xl bg-surface px-4 py-3 shadow-float ring-1 ring-brand-100"><span className="font-semibold text-ink-900">{label(x.visit_type)}</span><span className="text-sm text-ink-500">{fmtDate(x.visit_date)}</span></li>))}</ul>)}

      <h2 className="mb-2 mt-7 flex items-center gap-2 font-serif text-lg font-semibold text-ink-900"><ListChecks size={18} className="text-brand-500" />Agreed actions</h2>
      {v && v.follow_ups.length === 0 ? <Empty icon={<ListChecks size={34} />} title="No agreed actions" /> : (
        <ul className="space-y-2.5">{v?.follow_ups.map((f, i) => (
          <li key={i} className="rounded-3xl bg-surface px-4 py-3 shadow-float ring-1 ring-brand-100">
            <div className="flex items-start justify-between gap-3"><p className="font-semibold text-ink-900">{f.action ?? 'Agreed action'}</p><Badge tone={f.status === 'open' ? 'open' : 'accepted'}>{f.status === 'open' ? 'Open' : 'Done'}</Badge></div>
            <p className="text-sm text-ink-500">Due {fmtDate(f.due_date)}</p></li>))}</ul>)}
    </Shell>
  );
}
