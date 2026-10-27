'use client';
import { useState } from 'react';
import { Bot, CheckCircle2, CircleSlash, MessageSquareText, PlugZap, XCircle } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import { Badge, Button, Card, ErrorNote, Field, Select, Spinner, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { FEATURES } from '@/lib/app.config';
import { useDirectory, useLoad } from '@/lib/hooks';

export default function SettingsPage() {
  const status = useLoad(() => api.ai.status(), []);
  const usage = useLoad(() => api.ai.usage(30), []);
  return (
    <PageShell title="Settings" subtitle={FEATURES.aiAdmin ? 'Which AI does each job, what it has cost, and a box to ask questions about your data.' : 'Ask questions about your data.'}>
      {FEATURES.ask && <AskBox />}
      {FEATURES.aiAdmin && <AdminAI status={status} usage={usage} />}
    </PageShell>
  );
}

function AdminAI({ status, usage }: { status: ReturnType<typeof useLoad<import('@/lib/types').AIStatus>>; usage: ReturnType<typeof useLoad<import('@/lib/types').AIUsage>> }) {
  return (
    <>
      <KeyTest onDone={() => status.reload()} />
      <Card title={<span className="flex items-center gap-2"><Bot size={18} className="text-brand-600" />Who does each AI job</span>}
        subtitle="Set in config/ai.json (or AI_TASK_… settings in .env). Each job tries its list from left to right and uses the first one that is available. “rules” is the free built-in fallback, so the app always works.">
        {!status.data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-ink-400"><th className="py-2 pe-3">Job</th><th className="pe-3">Order to try</th><th>Used now</th></tr></thead>
              <tbody className="divide-y divide-brand-50">
                {Object.entries(status.data.tasks).map(([k, t]) => (
                  <tr key={k}><td className="py-2 pe-3"><b>{k.replace(/_/g, ' ')}</b><div className="text-xs text-ink-500">{t.description}</div></td>
                    <td className="pe-3"><div className="flex flex-wrap gap-1">{t.chain.map((p) => <Badge key={p} tone={status.data!.providers[p]?.available ? 'good' : 'neutral'}>{p}</Badge>)}</div></td>
                    <td><Badge tone={t.will_use === 'rules' ? 'warn' : 'brand'}>{t.will_use ?? 'none'}</Badge></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="AI providers">
        {!status.data ? <Spinner /> : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(status.data.providers).map(([k, p]) => (
              <li key={k} className="flex items-start gap-2 rounded-2xl bg-brand-50/50 p-3 text-sm">
                {p.available ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : <CircleSlash size={16} className="mt-0.5 shrink-0 text-ink-400" />}
                <div><b>{k}</b> <span className="text-xs text-ink-500">{p.type}{p.model ? ` · ${p.model}` : ''}</span><div className="text-xs text-ink-500">{p.reason}{p.note ? ` · ${p.note}` : ''}</div></div>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="AI cost (last 30 days)">
        {!usage.data ? <Spinner /> : (
          <>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><p className="text-2xl font-semibold text-ink-900">${usage.data.cost_usd.toFixed(2)}</p><p className="text-ink-500">last 30 days</p></div>
              <div><p className="text-2xl font-semibold text-ink-900">${usage.data.all_time_cost_usd.toFixed(2)}</p><p className="text-ink-500">all time</p></div>
              <div><p className="text-2xl font-semibold text-ink-900">{usage.data.calls}</p><p className="text-ink-500">AI calls ({usage.data.failed} failed)</p></div>
            </div>
            {usage.data.by_task.length > 0 && (
              <table className="mt-4 w-full text-sm"><thead><tr className="text-left text-xs uppercase tracking-wider text-ink-400"><th className="py-2">Job</th><th>Provider</th><th>Calls</th><th>Cost</th></tr></thead>
                <tbody className="divide-y divide-brand-50">{usage.data.by_task.map((r, i) => (
                  <tr key={i}><td className="py-1.5">{r.task}</td><td>{r.provider}{r.model && r.model !== '-' ? ` (${r.model})` : ''}</td><td>{r.calls}</td><td>${r.cost.toFixed(4)}</td></tr>))}</tbody></table>
            )}
          </>
        )}
      </Card>
    </>
  );
}

function KeyTest({ onDone }: { onDone: () => void }) {
  const [res, setRes] = useState<Record<string, { ok: boolean | null; message: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const test = async () => {
    setBusy(true); setError('');
    try { setRes(await api.ai.test()); onDone(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><PlugZap size={18} className="text-brand-600" />AI keys</span>}
      subtitle="Paste keys into the .env file in the project folder (ANTHROPIC_API_KEY, GEMINI_API_KEY, GROQ_API_KEY). They take effect straight away. This test is free: it does not use any AI credit."
      action={<Button onClick={test} busy={busy}>Test AI connections</Button>}>
      <ErrorNote error={error} />
      {res && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(res).map(([k, v]) => (
            <li key={k} className="flex items-start gap-2 rounded-2xl bg-brand-50/50 p-3 text-sm">
              {v.ok === true ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" /> : v.ok === false ? <XCircle size={16} className="mt-0.5 shrink-0 text-red-600" />
                : <CircleSlash size={16} className="mt-0.5 shrink-0 text-ink-400" />}
              <div><b>{k}</b><div className={`text-xs ${v.ok === false ? 'text-red-700' : 'text-ink-500'}`}>{v.message}</div></div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AskBox() {
  const dir = useDirectory();
  const [q, setQ] = useState('');
  const [scope, setScope] = useState('');
  const [ans, setAns] = useState<{ answer: string; records_used: string[]; answered_by: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ask = async () => {
    if (!q.trim()) return; setBusy(true); setError('');
    const [kind, id] = scope.split(':');
    try { setAns(await api.ai.ask(q, kind === 's' ? { school_id: id } : kind === 't' ? { teacher_id: id } : {})); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><MessageSquareText size={18} className="text-brand-600" />Ask the copilot</span>}
      subtitle="Questions are answered from the latest records, including files uploaded a minute ago.">
      <div className="grid gap-3 sm:grid-cols-[1fr_260px]">
        <TextArea value={q} onChange={(e) => setQ(e.target.value)} rows={2} placeholder="Which schools have follow-ups overdue by more than a month? What did the last visit to Wadgaon find?" />
        <Field label="About"><Select value={scope} onChange={(e) => setScope(e.target.value)}><option value="">All schools</option>
          {dir?.schools.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.code} · {s.name}</option>)}
          {dir?.teachers.map((t) => <option key={t.id} value={`t:${t.id}`}>{t.name}</option>)}</Select></Field>
      </div>
      <div className="mt-3"><Button onClick={ask} busy={busy} disabled={!q.trim()}>Ask</Button></div>
      <div className="mt-3"><ErrorNote error={error} /></div>
      {ans && <div className="mt-3 rounded-2xl bg-brand-50/60 p-4 text-sm"><p className="whitespace-pre-wrap text-ink-900">{ans.answer}</p><p className="mt-2 text-xs text-ink-400">Answered by {ans.answered_by}</p></div>}
    </Card>
  );
}
