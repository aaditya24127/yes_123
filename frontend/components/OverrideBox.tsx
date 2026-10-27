'use client';
// Lets the CRP move a school/teacher by hand (pin to top, move up/down, hold back) with a written reason. Every change is logged.
import { useState } from 'react';
import { Hand } from 'lucide-react';
import { api } from '@/lib/api';
import type { Item } from '@/lib/types';
import { Button, Field, Input, Select, TextArea } from './ui';

const ACTIONS = [
  { v: 'pin_top', label: 'Pin to the top' }, { v: 'up', label: 'Move up (add points)' }, { v: 'down', label: 'Move down (remove points)' }, { v: 'hold', label: 'Hold back (bottom of ranked list)' },
];

export default function OverrideBox({ item }: { item: Item }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState('pin_top');
  const [points, setPoints] = useState(10);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ov = item.override;

  const save = async () => {
    if (!reason.trim()) { setMsg('Please write a reason; it is shown next to the change.'); return; }
    setBusy(true); setMsg('');
    try {
      await api.overrides.add({ entity_type: item.entity, id: item.id, action: action === 'up' || action === 'down' ? 'adjust' : (action as 'pin_top' | 'hold'),
        points: action === 'down' ? -Math.abs(points) : Math.abs(points), reason, expires_on: until || null });
      setMsg('Saved. The list updates the next time it loads.'); setOpen(false);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!ov) return; setBusy(true);
    try { await api.overrides.remove(ov.id); setMsg('Removed. The list updates the next time it loads.'); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-dashed border-brand-200 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Hand size={16} className="text-brand-600" />
        <span className="text-sm font-semibold text-ink-900">Change this position by hand</span>
        {ov && <span className="text-xs text-ink-500">Now: {ov.action === 'pin_top' ? 'pinned to the top' : ov.action === 'hold' ? 'held back' : `${ov.points > 0 ? '+' : ''}${ov.points} points`} · “{ov.reason}”</span>}
        <span className="ms-auto flex gap-2">
          {ov && <Button variant="danger" className="px-3 py-1.5" busy={busy} onClick={remove}>Remove</Button>}
          <Button variant="soft" className="px-3 py-1.5" onClick={() => setOpen((v) => !v)}>{open ? 'Cancel' : ov ? 'Change' : 'Change'}</Button>
        </span>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="What to do"><Select value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((a) => <option key={a.v} value={a.v}>{a.label}</option>)}</Select></Field>
          {(action === 'up' || action === 'down') && <Field label="Points (0–100 scale)"><Input type="number" min={1} max={100} value={points} onChange={(e) => setPoints(Number(e.target.value))} /></Field>}
          <Field label="Until (optional)" hint="After this date the change stops by itself."><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          <Field label="Reason (required)" className="sm:col-span-2"><TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Block officer asked for a visit this month; new headmaster joined." /></Field>
          <div className="sm:col-span-2"><Button busy={busy} onClick={save}>Save change</Button></div>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink-500">{msg}</p>}
    </div>
  );
}
