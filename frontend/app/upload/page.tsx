'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, ChevronDown, Copy, FileText, Loader2, XCircle } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import FileDrop from '@/components/ui/FileDrop';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Note, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { SECTIONS } from '@/lib/app.config';
import { useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Batch, UploadItem } from '@/lib/types';

const SECTION_NAME: Record<string, string> = {
  assessments: 'Test results', observations: 'Visit report / observation', followups: 'Follow-up / action tracker', visits: 'Visit log', attendance: 'Attendance',
  audio: 'Recording', roster: 'Teacher list', facts: 'School numbers (enrolment…)', textbooks: 'Syllabus / textbook', other: 'Other',
};
const STATUS: Record<UploadItem['status'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'brand' }> = {
  sorted: { label: 'Ready', tone: 'good' }, needs_attention: { label: 'Check this', tone: 'warn' }, duplicate: { label: 'Already uploaded', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' }, importing: { label: 'Importing…', tone: 'brand' }, imported: { label: 'Imported', tone: 'good' }, failed: { label: 'Failed', tone: 'bad' },
};
const COUNT_LABEL: Record<string, string> = {
  assessments: 'test rows', assessments_valid: 'valid', assessments_conflict: 'conflicting', assessments_invalid: 'invalid', assessments_needs_review: 'to review',
  assessments_duplicate: 'duplicates', observations: 'observations', observations_valid: 'valid', observations_needs_review: 'to review', observations_duplicate: 'duplicates',
  actions_added: 'actions added', actions_updated: 'actions updated', attendance_months: 'months of attendance', visits: 'visits', visits_already_known: 'visits already known',
  teachers_added: 'teachers added', teachers_updated: 'teachers updated', facts: 'numbers',
};

function UploadPage() {
  const params = useSearchParams(); const router = useRouter();
  const dir = useDirectory();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState({ school_id: '', teacher_id: '', section: '' });
  const recent = useLoad(() => api.uploads.recent(), []);
  const ai = useLoad(() => api.ai.status(), []);

  const bid = params.get('batch');
  useEffect(() => { if (bid && bid !== batch?.id) api.uploads.get(bid).then(setBatch).catch((e) => setError(e.message)); }, [bid, batch?.id]);
  const refresh = () => batch && api.uploads.get(batch.id).then(setBatch).catch(() => {});
  usePoll(!!batch && (batch.status === 'importing' || batch.items.some((i) => i.status === 'importing')), () => { refresh(); });
  useEffect(() => { if (batch?.status === 'done') recent.reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [batch?.status]);

  const send = async (files: File[]) => {
    setBusy(true); setError('');
    try {
      const b = await api.uploads.send(files, { school_id: hint.school_id || undefined, teacher_id: hint.teacher_id || undefined, section: hint.section || undefined });
      setBatch(b); router.replace(`/upload?batch=${b.id}`); recent.reload();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const edit = async (it: UploadItem, ch: Record<string, string | null>) => {
    setBatch((b) => b && { ...b, items: b.items.map((x) => (x.id === it.id ? { ...x, ...ch } as UploadItem : x)) });
    try { await api.uploads.editItem(it.id, ch); await refresh(); } catch (e) { setError((e as Error).message); refresh(); }
  };
  const doImport = async () => {
    if (!batch) return; setBusy(true);
    try { await api.uploads.import(batch.id); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const groups = useMemo(() => {
    const it = batch?.items ?? [];
    return {
      ready: it.filter((i) => i.status === 'sorted'), attention: it.filter((i) => i.status === 'needs_attention'),
      working: it.filter((i) => i.status === 'importing'), done: it.filter((i) => i.status === 'imported' || i.status === 'failed'),
      other: it.filter((i) => i.status === 'duplicate' || i.status === 'skipped'),
    };
  }, [batch]);
  const reader = ai.data?.tasks.extract_records?.will_use;

  return (
    <PageShell title="Upload files" subtitle="Drop everything at once: results, visit reports, scans, photos of notes, recordings, attendance sheets, or a zip. The app sorts each file by school, teacher, type and date. Check, then import.">
      <ErrorNote error={error} onClose={() => setError('')} />
      <Card>
        <FileDrop onFiles={send} title={busy ? 'Reading and sorting…' : 'Drop files or a zip here, or click to choose'}
          hint="Excel, CSV, Word, PDF (typed or scanned), photos, audio. Nothing is added to the ranking until you press Import." />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">All these files are from one school or teacher? (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="School"><Select value={hint.school_id} onChange={(e) => setHint({ ...hint, school_id: e.target.value, teacher_id: '' })}>
              <option value="">Work it out from each file</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select></Field>
            <Field label="Teacher"><Select value={hint.teacher_id} onChange={(e) => setHint({ ...hint, teacher_id: e.target.value })}>
              <option value="">Work it out</option>{dir?.teachers.filter((t) => !hint.school_id || t.school_id === hint.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Type"><Select value={hint.section} onChange={(e) => setHint({ ...hint, section: e.target.value })}>
              <option value="">Work it out</option>{SECTIONS.map((s) => <option key={s} value={s}>{SECTION_NAME[s]}</option>)}</Select></Field>
          </div>
        </details>
        {busy && <div className="mt-3"><Spinner label="Reading and sorting your files…" /></div>}
      </Card>

      {batch && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">{groups.ready.length} ready</Badge><Badge tone="warn">{groups.attention.length} to check</Badge>
            <Badge tone="neutral">{groups.other.length} duplicate / skipped</Badge><Badge tone="brand">{groups.done.length} imported</Badge>
            {reader && <span className="text-xs text-ink-500">Reading reports and scans: <b>{reader === 'rules' ? 'no AI switched on (tables only)' : reader}</b></span>}
            <Button className="ms-auto" onClick={doImport} busy={busy || groups.working.length > 0} disabled={!groups.ready.length}>
              {groups.working.length ? `Importing ${groups.working.length}…` : `Import ${groups.ready.length} file${groups.ready.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          {groups.attention.length > 0 && (
            <Card title="Please check these" subtitle="The app was not sure which school, teacher or type these are. Pick the right ones and they move to Ready.">
              <Rows items={groups.attention} onEdit={edit} dir={dir} />
            </Card>
          )}
          {(groups.ready.length > 0 || groups.working.length > 0) && <Card title="Ready to import"><Rows items={[...groups.working, ...groups.ready]} onEdit={edit} dir={dir} /></Card>}
          {groups.done.length > 0 && <Card title="Imported"><Rows items={groups.done} onEdit={edit} dir={dir} done /></Card>}
          {groups.other.length > 0 && <Card title="Not imported" subtitle="Duplicates are ignored so they never count twice."><Rows items={groups.other} onEdit={edit} dir={dir} /></Card>}
        </>
      )}

      <Card title="Recent uploads">
        {recent.loading && !recent.data ? <Spinner /> : !recent.data?.length ? <Empty>No uploads yet.</Empty> : (
          <ul className="divide-y divide-brand-50">
            {recent.data.map((b) => (
              <li key={b.id}>
                <button onClick={() => { router.replace(`/upload?batch=${b.id}`); }} className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700">
                  <span className="w-40 shrink-0 text-ink-500">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="flex-1 truncate">{b.note || (b.origin === 'teacher' ? 'From a teacher' : 'Upload')} · {b.files} files</span>
                  {b.attention > 0 && <Badge tone="warn">{b.attention} to check</Badge>}<Badge tone={b.status === 'done' ? 'good' : 'brand'}>{b.imported} imported</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

function Rows({ items, onEdit, dir, done }: { items: UploadItem[]; onEdit: (it: UploadItem, ch: Record<string, string | null>) => void; dir: ReturnType<typeof useDirectory>; done?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-brand-50">
      {items.map((it) => {
        const st = STATUS[it.status]; const locked = it.status === 'imported' || it.status === 'importing';
        const counts = Object.entries(it.result?.counts ?? {}).filter(([k, v]) => typeof v === 'number' && COUNT_LABEL[k] && !k.includes('_valid'));
        return (
          <li key={it.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              {it.status === 'importing' ? <Loader2 size={16} className="animate-spin text-brand-600" /> : it.status === 'imported' ? <CheckCircle2 size={16} className="text-emerald-600" />
                : it.status === 'failed' ? <XCircle size={16} className="text-red-600" /> : it.status === 'duplicate' ? <Copy size={16} className="text-ink-400" />
                : it.status === 'needs_attention' ? <AlertTriangle size={16} className="text-amber-600" /> : <FileText size={16} className="text-brand-600" />}
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-900" title={it.name}>{it.name}</span>
              <Badge tone={st.tone}>{st.label}</Badge>
              {!done && it.confidence > 0 && it.status !== 'duplicate' && <span className="text-xs text-ink-400">{Math.round(it.confidence * 100)}% sure</span>}
              <button onClick={() => setOpen(open === it.id ? null : it.id)} className="rounded-full p-1 text-ink-400 hover:bg-brand-50" aria-label="Why"><ChevronDown size={16} /></button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Select disabled={locked} value={it.school_id ?? ''} onChange={(e) => onEdit(it, { school_id: e.target.value || null, teacher_id: null })}>
                <option value="">Which school?</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select>
              <Select disabled={locked || !it.school_id} value={it.teacher_id ?? ''} onChange={(e) => onEdit(it, { teacher_id: e.target.value || null })}>
                <option value="">Whole school / not one teacher</option>{dir?.teachers.filter((t) => t.school_id === it.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Select disabled={locked} value={it.section ?? 'other'} onChange={(e) => onEdit(it, { section: e.target.value })}>
                {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_NAME[s]}</option>)}</Select>
              <div className="flex gap-2">
                <Input disabled={locked} type="date" value={it.record_date ?? ''} onChange={(e) => onEdit(it, { record_date: e.target.value })} />
                {!locked && it.status !== 'skipped' && <Button variant="ghost" className="px-2" onClick={() => onEdit(it, { status: 'skipped' })}>Skip</Button>}
              </div>
            </div>
            {done && (
              <div className="mt-2 text-sm text-ink-700">
                {counts.length > 0 ? <span>Read {counts.map(([k, v]) => `${v} ${COUNT_LABEL[k]}`).join(', ')}{it.result?.read_by ? ` (by ${it.result.read_by})` : ''}.</span> : <span className="text-ink-500">Stored; no records read.</span>}
                {typeof it.result?.counts?.summary === 'string' && <p className="mt-1 text-ink-500">{it.result.counts.summary}</p>}
                {it.result?.warnings?.map((w, i) => <p key={i} className="mt-1 text-amber-700">⚠ {w}</p>)}
                {it.error && <p className="mt-1 text-red-700">{it.error}</p>}
              </div>
            )}
            {open === it.id && (
              <div className="mt-2 rounded-2xl bg-brand-50/60 p-3 text-xs text-ink-700">
                <p className="font-semibold">How it was sorted{it.sorted_by ? ` (${it.sorted_by})` : ''}:</p>
                <ul className="mt-1 list-disc ps-4">{(it.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}</ul>
                {it.preview && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-sans text-ink-500">{it.preview.slice(0, 800)}</pre>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function Page() {
  return <Suspense fallback={null}><UploadPage /></Suspense>;
}
