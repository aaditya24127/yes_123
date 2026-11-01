'use client';
// One numbered task ("Task 2"): what the CRP asked for, what the teacher has already sent, the CRP's remarks if it needs changes, and the upload box.
import { useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, FileUp, Paperclip, Send, X } from 'lucide-react';
import { api, type TaskItem } from '@/lib/api';
import { fmtAgo } from '@/lib/hooks';
import { Badge, Button } from '@/components/ui';

const HINT: Record<string, string> = {
  marks: 'Upload the marks sheet (Excel, CSV, PDF) or a clear photo of it.', attendance: 'Upload the attendance sheet or a photo of the register.',
  syllabus_plan: 'Upload your syllabus or year plan.', lesson_plan: 'Upload your lesson plan.', 
  student_work: 'Upload photos of student work.', reflection: 'Write a short note, or upload it.', other: 'Add what your CRP asked for.',
};
const size = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function TaskItemCard({ item, label, onSent }: { item: TaskItem; label: string; onSent: () => void | Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const pick = useRef<HTMLInputElement>(null);
  const cam = useRef<HTMLInputElement>(null);
  // Documents and photos only: audio cannot be sent from this app.
  const isAudio = (f: File) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|webm|aac|opus|amr)$/i.test(f.name);
  const add = (list: FileList | null) => {
    if (!list) return;
    const all = Array.from(list); const ok = all.filter((f) => !isAudio(f));
    setErr(ok.length < all.length ? 'Audio recordings cannot be sent from this app. Please choose documents or photos.' : '');
    if (ok.length) setFiles((f) => [...f, ...ok]);
  };

  const accepted = item.status === 'accepted';
  const rejected = item.status === 'rejected';
  const sent = item.files.filter((f) => f.status !== 'skipped');
  const replaced = item.files.filter((f) => f.status === 'skipped');

  const send = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api.submit({ itemId: item.id }, text, files);
      setFiles([]); setText('');
      setMsg(r.files ? `Sent ${r.files} file${r.files === 1 ? '' : 's'} to your CRP. Thank you!` : 'Sent to your CRP. Thank you!');
      await onSent();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send. Please try again.'); }
    setBusy(false);
  };

  return (
    <section className={`rounded-3xl bg-surface p-5 shadow-float ring-1 ${rejected ? 'ring-red-200' : accepted ? 'ring-emerald-200' : 'ring-brand-100'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">{label}</span>
        {accepted ? <Badge tone="accepted">Accepted</Badge> : rejected ? <Badge tone="late">Needs changes</Badge> : item.status === 'submitted' ? <Badge tone="submitted">Sent, waiting for your CRP</Badge> : <Badge tone="open">To do</Badge>}
      </div>
      <h3 className="mt-2 font-serif text-xl font-semibold text-ink-900">{item.title}</h3>
      {item.instructions && <p className="mt-1 whitespace-pre-wrap text-ink-700">{item.instructions}</p>}

      {rejected && item.review_remark && (
        <div role="alert" className="mt-3 flex gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" /><div><p className="font-semibold">Your CRP asked for changes</p><p className="mt-0.5 whitespace-pre-wrap">{item.review_remark}</p></div>
        </div>
      )}
      {accepted && <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={18} />Your CRP accepted this. Thank you!</p>}

      {(sent.length > 0 || item.response_text) && (
        <div className="mt-4 rounded-2xl bg-page p-3">
          <p className="text-sm font-semibold text-ink-900">{accepted ? 'What you sent' : 'What you have sent'}</p>
          {sent.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {sent.map((f) => (
                <li key={f.id} className="flex items-center gap-2 text-sm"><Paperclip size={14} className="shrink-0 text-brand-500" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span><span className="shrink-0 text-xs text-ink-400">{size(f.size)} · {fmtAgo(f.created_at)}</span></li>))}
            </ul>
          )}
          {item.response_text && <p className="mt-2 whitespace-pre-wrap rounded-xl bg-surface p-2.5 text-sm text-ink-700">{item.response_text}</p>}
          {replaced.length > 0 && <p className="mt-2 text-xs text-ink-400">Earlier version replaced: {replaced.map((f) => f.name).join(', ')}</p>}
        </div>
      )}

      {!accepted && (
        <div className="mt-4">
          <p className="mb-2 text-sm text-ink-500">{rejected ? 'Send it again with the changes.' : item.status === 'submitted' ? 'You can send more files or a note.' : HINT[item.kind] ?? HINT.other}</p>
          <input ref={pick} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.ppt,.pptx,.zip" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="soft" onClick={() => pick.current?.click()}><FileUp size={16} />Choose files</Button>
            <Button type="button" variant="soft" onClick={() => cam.current?.click()}><Camera size={16} />Take a photo</Button>
          </div>
          {files.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <li key={i} className="flex items-center gap-2 rounded-2xl bg-page px-3 py-2 text-sm"><Paperclip size={14} className="shrink-0 text-brand-500" />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span><span className="shrink-0 text-xs text-ink-400">{size(f.size)}</span>
                  <button type="button" onClick={() => setFiles((l) => l.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`} className="text-ink-400 hover:text-red-600"><X size={16} /></button></li>))}
            </ul>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Add a note for your CRP (optional)"
            className="mt-3 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
          {err && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{err}</p>}
          {msg && <p role="status" className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 ring-1 ring-emerald-200">{msg}</p>}
          <Button className="mt-3 w-full" busy={busy} disabled={!files.length && !text.trim()} onClick={send}><Send size={16} />Send {label.toLowerCase()} to my CRP</Button>
        </div>
      )}
    </section>
  );
}
