'use client';
// "Give tasks": the CRP writes numbered tasks (Task 1, Task 2 ...), each with its own instructions, and sends them to a teacher or a whole school.
// A visit notice is a separate mode. Sending always asks for a date first (pop-up), and cannot go ahead without one.
import { useState } from 'react';
import { CalendarClock, ListPlus, Send, Trash2 } from 'lucide-react';
import { Button, Card, Field, Input, Pill, Select, TextArea } from '@/components/ui';
import DatePrompt from '@/components/ui/DatePrompt';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import type { ConnectRow } from '@/lib/types';
import { useLang } from '@/lib/i18n';

type Draft = { kind: string; title: string; instructions: string };
const blank = (): Draft => ({ kind: 'marks', title: '', instructions: '' });

export default function TaskComposer({ row, onSent, onError }: { row: ConnectRow; onSent: () => void; onError: (m: string) => void }) {
  const { tr } = useLang();
  const opts = useLoad(() => api.connect.taskOptions(), []);
  const [mode, setMode] = useState<'tasks' | 'visit'>('tasks');
  const [pkgTitle, setPkgTitle] = useState('');
  const [message, setMessage] = useState('');
  const [asking, setAsking] = useState(false);
  const [items, setItems] = useState<Draft[]>([blank()]);
  const [wholeSchool, setWholeSchool] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');

  const kinds = opts.data?.kinds ?? [];
  const set = (i: number, patch: Partial<Draft>) => setItems((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const filled = items.filter((x) => x.instructions.trim() || x.title.trim());
  const canSend = mode === 'visit' ? true : filled.length > 0;
  const target = wholeSchool ? { school_id: row.school_id } : { teacher_ids: [row.id] };

  const send = async (date: string) => {
    setBusy(true); setOk('');
    try {
      const r = mode === 'visit'
        ? await api.connect.request({ kind: 'visit_notice', visit_date: date, message: message || undefined, ...target })
        : await api.connect.request({ kind: 'other', title: pkgTitle || undefined, message: message || undefined, due_date: date, ...target,
            items: filled.map((x) => ({ kind: x.kind, title: x.title.trim() || undefined, instructions: x.instructions.trim() || undefined })) });
      setOk((r.created === 1 ? tr('Sent to 1 teacher.') : tr('Sent to {n} teachers.', { n: r.created })));
      setMessage(''); setPkgTitle(''); setItems([blank()]); setAsking(false);
      onSent();
    } catch (e) { onError((e as Error).message); setAsking(false); }
    setBusy(false);
  };

  return (
    <Card tour="t-tasks" title={tr('Give tasks')} subtitle={tr('Write what you need, one task at a time. The teacher sees each task on their phone and sends it back. You then accept it or ask for changes.')}>
      <div className="mb-4 flex gap-2">
        <Pill active={mode === 'tasks'} onClick={() => setMode('tasks')}>{tr('Tasks')}</Pill>
        <Pill active={mode === 'visit'} onClick={() => setMode('visit')}>{tr('Visit notice')}</Pill>
      </div>

      {mode === 'visit' ? (
        <div className="grid gap-3">
          <Field label={tr('Message (optional)')}><TextArea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('Please keep Class 4 marks and your lesson plan ready.')} /></Field>
        </div>
      ) : (
        <div className="grid gap-3">
          <Field label={tr('Heading (optional)')}><Input value={pkgTitle} onChange={(e) => setPkgTitle(e.target.value)} placeholder={tr('Before my visit on Friday')} /></Field>
          <Field label={tr('Message for everything (optional)')}><TextArea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={tr('Hello! Please send these before the visit.')} /></Field>

          <ol className="grid gap-3">
            {items.map((it, i) => (
              <li key={i} className="rounded-2xl bg-brand-50/60 p-3 ring-1 ring-brand-100">
                <div className="mb-2 flex items-center gap-2">
                  <span className="shrink-0 whitespace-nowrap rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{tr('Task {x}', { x: i + 1 })}</span>
                  <Select value={it.kind} onChange={(e) => set(i, { kind: e.target.value })} className="min-w-0 flex-1 truncate">
                    {(kinds.length ? kinds : [{ code: it.kind, label: it.kind, default_add_to: null }]).map((k) => <option key={k.code} value={k.code}>{tr(k.label)}</option>)}
                  </Select>
                  {items.length > 1 && <button type="button" onClick={() => setItems((l) => l.filter((_, j) => j !== i))} aria-label={tr('Remove task {x}', { x: i + 1 })} className="rounded-full p-2 text-ink-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>}
                </div>
                <Input value={it.title} onChange={(e) => set(i, { title: e.target.value })} placeholder={tr('Short name (optional), for example Class 4 marks')} className="mb-2" />
                <TextArea rows={2} value={it.instructions} onChange={(e) => set(i, { instructions: e.target.value })}
                  placeholder={tr('What should the teacher add or give? For example: first term marks for all subjects, as an Excel sheet or a clear photo.')} />
              </li>
            ))}
          </ol>
          <div><Button variant="soft" icon={<ListPlus size={16} />} onClick={() => setItems((l) => [...l, blank()])}>{tr('Add Task {x}', { x: items.length + 1 })}</Button></div>
        </div>
      )}

      <label className="mt-2 flex min-h-9 items-center gap-2.5 py-1 text-sm"><input type="checkbox" checked={wholeSchool} onChange={(e) => setWholeSchool(e.target.checked)} className="h-5 w-5 shrink-0" />{tr('Send to all teachers of {school}', { school: row.school_name })}</label>
      <div className="mt-3 flex items-center gap-3">
        <Button icon={mode === 'visit' ? <CalendarClock size={16} /> : <Send size={16} />} disabled={!canSend} onClick={() => setAsking(true)}>
          {mode === 'visit' ? tr('Send notice') : (filled.length > 1 ? tr('Send {n} tasks', { n: filled.length }) : tr('Send task'))}</Button>
        {ok && <span className="text-sm text-emerald-700">{tr(ok)}</span>}
      </div>
      <DatePrompt open={asking} busy={busy} onClose={() => setAsking(false)} onConfirm={send} confirmLabel={mode === 'visit' ? tr('Send notice') : tr('Send')}
        title={mode === 'visit' ? tr('Date of the visit') : tr('Send by which date?')}
        question={mode === 'visit' ? tr('On which day will you visit?') : tr('By which date should the teacher send these?')} />
    </Card>
  );
}
