'use client';
// What the teacher sent, task by task. The CRP opens the files, then accepts (and can add them to the records) or rejects with remarks.
import { useState } from 'react';
import Link from 'next/link';
import { Check, ExternalLink as OpenIcon, Paperclip, X } from 'lucide-react';
import { Badge, Button, Card, Empty, Field, Select, TextArea } from '@/components/ui';
import ExtLink from '@/components/ui/ExtLink';
import { api } from '@/lib/api';
import { useLoad } from '@/lib/hooks';
import type { TaskItem, TaskOptions, TRequest } from '@/lib/types';
import { useLang } from '@/lib/i18n';

const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const tone = (s: TaskItem['status']) => (s === 'accepted' ? 'good' : s === 'submitted' ? 'brand' : s === 'rejected' ? 'bad' : 'warn') as 'good' | 'brand' | 'bad' | 'warn';
const label = (s: TaskItem['status']) => (s === 'accepted' ? 'Accepted' : s === 'submitted' ? 'Sent, needs your review' : s === 'rejected' ? 'Rejected, waiting for the teacher' : 'Waiting for the teacher');

function ItemReview({ item, opts, onChange, onError }: { item: TaskItem; opts: TaskOptions | null; onChange: () => void; onError: (m: string) => void }) {
  const { tr } = useLang();
  const [panel, setPanel] = useState<'accept' | 'reject' | null>(null);
  const [addTo, setAddTo] = useState('');
  const [scope, setScope] = useState<'teacher' | 'school'>('teacher');
  const [remark, setRemark] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const addToLabel = (code: string | null) => opts?.add_to.find((a) => a.code === code)?.label ?? code;
  const live = item.files.filter((f) => f.status !== 'skipped');
  const old = item.files.filter((f) => f.status === 'skipped');

  const run = async (body: Parameters<typeof api.connect.review>[1]) => {
    setBusy(true);
    try {
      const r = await api.connect.review(item.id, body);
      setDone(r.status === 'rejected' ? tr('Sent back to the teacher with your remarks.')
        : r.queued ? (r.queued === 1 ? tr('Accepted. 1 file is being added to the records.') : tr('Accepted. {n} files are being added to the records.', { n: r.queued })) : r.skipped_duplicates ? tr('Accepted. The file was already in the system, so nothing new was added.') : tr('Accepted.'));
      setPanel(null); onChange();
    } catch (e) { onError((e as Error).message); }
    setBusy(false);
  };

  return (
    <li className="rounded-2xl bg-brand-50/50 p-3 ring-1 ring-brand-100">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white">{tr('Task {position}', { position: item.position })}</span>
        <b className="order-last min-w-0 basis-full text-sm sm:order-none sm:flex-1 sm:basis-auto">{tr(item.title)}</b>
        <Badge tone={tone(item.status)} className="ms-auto sm:ms-0">{label(item.status)}</Badge>
      </div>
      {item.instructions && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700">{tr(item.instructions)}</p>}

      {(live.length > 0 || item.response_text) && (
        <div className="mt-2 rounded-xl bg-surface p-2.5 ring-1 ring-brand-100">
          {live.length > 0 && (
            <ul className="space-y-1">
              {live.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm"><Paperclip size={14} className="shrink-0 text-brand-500" />
                  <ExtLink href={api.connect.uploadedFileUrl(f.id)} className="min-w-0 flex-1 truncate text-brand-700 underline">{tr(f.name)}</ExtLink>
                  <span className="shrink-0 text-xs text-ink-400">{size(f.size)}</span>
                  {f.status === 'imported' && <Badge tone="good">{tr('In the records')}</Badge>}{f.status === 'importing' && <Badge tone="warn">{tr('Adding…')}</Badge>}
                  {f.status === 'failed' && <Badge tone="bad">{tr('Could not add')}</Badge>}{f.status === 'duplicate' && <Badge tone="neutral">{tr('Already in the system')}</Badge>}
                  <OpenIcon size={13} className="shrink-0 text-ink-400" /></li>))}
            </ul>
          )}
          {item.response_text && <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-700"><span className="font-semibold">{tr('Teacher\'s note:')}{' '}</span>{tr(item.response_text)}</p>}
          {old.length > 0 && <p className="mt-1.5 text-xs text-ink-400">{tr('Earlier attempt replaced:')}{' '}{old.map((f) => f.name).join(', ')}</p>}
        </div>
      )}
      {item.status === 'rejected' && item.review_remark && <p className="mt-2 rounded-xl bg-red-50 p-2.5 text-sm text-red-800"><span className="font-semibold">{tr('Your remarks:')}{' '}</span>{tr(item.review_remark)}</p>}
      {item.status === 'accepted' && <p className="mt-2 text-sm text-emerald-700">{item.added_to ? <>{tr('Added to:')}{' '}<b>{addToLabel(item.added_to)}</b>. <Link href="/upload" className="underline">{tr('See imports')}</Link></> : tr('Accepted without adding to the records.')}</p>}
      {done && <p role="status" className="mt-2 text-sm text-emerald-700">{tr(done)}</p>}

      {item.status === 'submitted' && panel === null && (
        <div className="mt-3 flex gap-2">
          <Button icon={<Check size={15} />} onClick={() => { const d = opts?.kinds.find((k) => k.code === item.kind)?.default_add_to ?? ''; setAddTo(d); setScope(d === 'facts' || d === 'roster' ? 'school' : 'teacher'); setPanel('accept'); }}>{tr('Accept')}</Button>
          <Button variant="danger" icon={<X size={15} />} onClick={() => setPanel('reject')}>{tr('Reject')}</Button>
        </div>
      )}

      {panel === 'accept' && (
        <div className="mt-3 grid gap-3 rounded-xl bg-surface p-3 ring-1 ring-brand-100">
          <Field label={tr('Add to the records as')} hint={tr('This reads the files and creates the records (for example the marks per class) in the system.')}>
            <Select value={addTo} onChange={(e) => { setAddTo(e.target.value); if (e.target.value === 'facts' || e.target.value === 'roster') setScope('school'); }}>
              <option value="">{tr('Just accept (do not add to the records)')}</option>
              {(opts?.add_to ?? []).map((a) => <option key={a.code} value={a.code}>{tr(a.label)}</option>)}
            </Select>
          </Field>
          {addTo && addTo !== 'other' && (
            <Field label={tr('Belongs to')}>
              <Select value={scope} onChange={(e) => setScope(e.target.value as 'teacher' | 'school')}>
                <option value="teacher">{tr('This teacher')}</option><option value="school">{tr('The whole school')}</option>
              </Select>
            </Field>
          )}
          <div className="flex gap-2">
            <Button busy={busy} icon={<Check size={15} />} onClick={() => run({ action: 'accept', add_to: addTo || undefined, scope })}>{addTo ? tr('Accept and add') : tr('Accept')}</Button>
            <Button variant="ghost" onClick={() => setPanel(null)}>{tr('Cancel')}</Button>
          </div>
        </div>
      )}

      {panel === 'reject' && (
        <div className="mt-3 grid gap-3 rounded-xl bg-surface p-3 ring-1 ring-red-100">
          <Field label={tr('Remarks for the teacher (required)')} hint={tr('Say what is missing or wrong so they can fix it and send again.')}>
            <TextArea rows={3} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder={tr('The English marks are missing. Please add them.')} />
          </Field>
          <div className="flex gap-2">
            <Button variant="danger" busy={busy} disabled={!remark.trim()} icon={<X size={15} />} onClick={() => run({ action: 'reject', remark })}>{tr('Reject and send back')}</Button>
            <Button variant="ghost" onClick={() => setPanel(null)}>{tr('Cancel')}</Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function TaskReview({ requests, onChange, onError }: { requests: TRequest[] | null; onChange: () => void; onError: (m: string) => void }) {
  const { tr } = useLang();
  const opts = useLoad(() => api.connect.taskOptions(), []);
  const waiting = (requests ?? []).reduce((n, r) => n + r.items.filter((i) => i.status === 'submitted').length, 0);
  return (
    <Card tour="t-review" title={<span className="flex items-center gap-2">{tr('Tasks and answers')}{' '}{waiting > 0 && <Badge tone="brand">{tr('{waiting} to review', { waiting })}</Badge>}</span>}>
      {!requests?.length ? <Empty>{tr('No tasks yet.')}</Empty> : (
        <ul className="grid gap-5">
          {requests.map((r) => (
            <li key={r.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                <b className="text-base">{tr(r.title)}</b>
                {r.due_date && <span className="text-ink-500">{tr('by {due_date}', { due_date: r.due_date })}</span>}{r.visit_date && <span className="text-ink-500">{tr('visit {visit_date}', { visit_date: r.visit_date })}</span>}
                {r.status === 'cancelled' && <Badge>{tr('Cancelled')}</Badge>}
                {r.items.length === 0 && r.status !== 'cancelled' && <Badge tone={r.status === 'submitted' ? 'good' : 'warn'}>{r.status === 'submitted' ? tr('Teacher confirmed') : tr('Waiting for the teacher')}</Badge>}
                {r.status === 'open' && r.items.length === 0 && (
                  <Button variant="ghost" className="ms-auto px-3 py-1" onClick={async () => { try { await api.connect.setRequest(r.id, 'cancelled'); onChange(); } catch (e) { onError((e as Error).message); } }}>{tr('Cancel')}</Button>
                )}
              </div>
              {r.message && <p className="mb-2 whitespace-pre-wrap text-sm text-ink-500">{tr(r.message)}</p>}
              {r.items.length > 0 && (
                <ul className="grid gap-2">
                  {r.items.map((it) => <ItemReview key={it.id} item={it} opts={opts.data} onChange={onChange} onError={onError} />)}
                </ul>
              )}
              {r.items.length === 0 && r.response_text && <p className="text-sm text-ink-700">{tr('Teacher\'s note: {response_text}', { response_text: r.response_text })}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
