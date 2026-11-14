'use client';
// Ask a question about your schools and teachers; the answer comes from the latest records.
import { useState } from 'react';
import { MessageSquareText } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import { Button, Card, ErrorNote, Field, Select, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useDirectory } from '@/lib/hooks';
import { useLang } from '@/lib/i18n';

const EXAMPLES = ['Which schools have follow-ups overdue by more than a month?', 'What did the last visit to Wadgaon find?', 'Which teachers need help with maths?'];

export default function AskPage() {
  const { tr } = useLang();
  const dir = useDirectory();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const [ans, setAns] = useState<{ answer: string; records_used: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ask = async () => {
    if (!q.trim()) return; setBusy(true); setError('');
    const [kind, id] = scope.split(':');
    try { setAns(await api.ai.ask(q, kind === 's' ? { school_id: id } : kind === 't' ? { teacher_id: id } : {})); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <PageShell title={tr('Ask a question')} subtitle={tr('Ask anything about your schools and teachers. The answer comes from your latest records, including files you added a minute ago.')}>
      <Card tour="a-card" title={<span className="flex items-center gap-2"><MessageSquareText size={18} className="text-brand-600" />{tr('Your question')}</span>}>
        <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
          <TextArea value={q} onChange={(e) => setQ(e.target.value)} rows={3} placeholder={tr('Type your question here')} />
          <Field label={tr('About')}><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">{tr('All schools')}</option>
            {dir?.schools.map((s) => <option key={s.id} value={`s:${s.id}`}>{tr(s.name)}</option>)}
            {dir?.teachers.map((t) => <option key={t.id} value={`t:${t.id}`}>{tr(t.name)}</option>)}</Select></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">{EXAMPLES.map((x) => <button key={x} onClick={() => setQ(x)} className="rounded-full bg-brand-50 px-3 py-2.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100 lg:py-1.5">{tr(x)}</button>)}</div>
        <div className="mt-4"><Button onClick={ask} busy={busy} disabled={!q.trim()}>{tr('Ask')}</Button></div>
        <div className="mt-3"><ErrorNote error={error} /></div>
        {ans && <div className="mt-3 rounded-2xl bg-brand-50/60 p-4 text-sm"><p className="whitespace-pre-wrap text-ink-900">{tr(ans.answer)}</p></div>}
      </Card>
    </PageShell>
  );
}
