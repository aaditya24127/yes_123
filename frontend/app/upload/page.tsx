'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ClipboardCheck, Copy, FileText, GraduationCap, ListTree, Loader2, Mic, School, Table2, Users, XCircle } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import FileDrop from '@/components/ui/FileDrop';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Note, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { SECTIONS } from '@/lib/app.config';
import { refreshDirectory, useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Allocation, AllocationRow, Batch, Detected, UploadItem } from '@/lib/types';

const SECTION_NAME: Record<string, string> = {
  assessments: 'Test marks', observations: 'Visit report or notes', followups: 'Agreed actions', visits: 'List of visits', attendance: 'Attendance',
  audio: 'Recording', roster: 'Teacher list', facts: 'School numbers', textbooks: 'Textbook or syllabus', other: 'Something else',
};
// What the CRP can add, in plain words.
const KINDS = [
  { icon: Table2, title: 'Test marks', text: 'An Excel or CSV marks sheet, or a clear photo of one.' },
  { icon: ClipboardCheck, title: 'Visit reports and notes', text: 'Word or PDF reports, or photos of handwritten notes.' },
  { icon: Users, title: 'Attendance and teacher lists', text: 'Monthly attendance sheets, or the list of teachers of a school.' },
  { icon: Building2, title: 'School numbers', text: 'Any sheet with numbers about a school, such as students enrolled.' },
  { icon: Mic, title: 'Recordings', text: 'Lesson recordings. They are turned into text for you.' },
  { icon: GraduationCap, title: 'Textbooks and syllabus', text: 'A textbook or syllabus PDF for a class.' },
];
const STATUS: Record<UploadItem['status'], { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' | 'brand' }> = {
  sorted: { label: 'Ready', tone: 'good' }, needs_attention: { label: 'Please check', tone: 'warn' }, duplicate: { label: 'Added before', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' }, importing: { label: 'Adding…', tone: 'brand' }, imported: { label: 'Added', tone: 'good' }, failed: { label: 'Could not add', tone: 'bad' },
};
const COUNT_LABEL: Record<string, string> = {
  assessments: 'test results', assessments_conflict: 'that clash with earlier numbers', assessments_invalid: 'that could not be used', assessments_needs_review: 'to check',
  assessments_duplicate: 'already known', observations: 'observations', observations_needs_review: 'to check', observations_duplicate: 'already known',
  actions_added: 'actions added', actions_updated: 'actions updated', attendance_months: 'months of attendance', visits: 'visits', visits_already_known: 'visits already known',
  teachers_added: 'teachers added', teachers_updated: 'teachers updated', facts: 'school numbers',
};

function UploadPage() {
  const params = useSearchParams(); const router = useRouter();
  const dir = useDirectory();
  const [batch, setBatch] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState({ school_id: '', teacher_id: '', section: '' });
  const recent = useLoad(() => api.uploads.recent(), []);

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
  const addSchool = async (it: UploadItem, name: string, teachers: string[]) => {
    try { await api.uploads.addSchool(it.id, { name, teachers }); refreshDirectory(); await refresh(); } catch (e) { setError((e as Error).message); }
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

  return (
    <PageShell title="Add files" subtitle="Add your school files here. We sort them for you. You check them, then press Import.">
      <ErrorNote error={error} onClose={() => setError('')} />
      <Card tour="u-what" title="What can you add?" subtitle="Add anything you have. If you are not sure, add it anyway: we find the right place and ask you to check.">
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {KINDS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-2 rounded-2xl bg-brand-50/60 p-2.5 sm:gap-3 sm:p-3">
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-float min-[400px]:flex"><Icon size={18} /></span>
              <span><b className="block text-[13px] leading-snug text-ink-900 sm:text-sm">{title}</b><span className="hidden text-xs text-ink-500 sm:inline">{text}</span></span>
            </li>
          ))}
        </ul>
        <ol className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-ink-700">
          {['Add your files', 'Check what we found', 'Press Import'].map((t, i) => (
            <li key={t} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 ring-1 ring-brand-100"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] text-white">{i + 1}</span>{t}</li>))}
        </ol>
      </Card>
      <Card tour="u-drop">
        <FileDrop onFiles={send} title={busy ? 'Reading your files…' : 'Drop files here, or tap to choose'}
          hint="You can add many files at once, or one zip. Nothing changes your priorities until you press Import." />
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-brand-700">Are all these files about one school or teacher? (optional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="School"><Select value={hint.school_id} onChange={(e) => setHint({ ...hint, school_id: e.target.value, teacher_id: '' })}>
              <option value="">We will find it</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Teacher"><Select value={hint.teacher_id} onChange={(e) => setHint({ ...hint, teacher_id: e.target.value })}>
              <option value="">We will find it</option>{dir?.teachers.filter((t) => !hint.school_id || t.school_id === hint.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Kind of file"><Select value={hint.section} onChange={(e) => setHint({ ...hint, section: e.target.value })}>
              <option value="">We will find it</option>{SECTIONS.map((s) => <option key={s} value={s}>{SECTION_NAME[s]}</option>)}</Select></Field>
          </div>
        </details>
        {busy && <div className="mt-3"><Spinner label="Reading your files…" /></div>}
      </Card>

      {batch && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">{groups.ready.length} ready</Badge><Badge tone="warn">{groups.attention.length} to check</Badge>
            <Badge tone="neutral">{groups.other.length} skipped</Badge><Badge tone="brand">{groups.done.length} added</Badge>
            <Button className="ms-auto" onClick={doImport} busy={busy || groups.working.length > 0} disabled={!groups.ready.length}>
              {groups.working.length ? `Adding ${groups.working.length}…` : `Import ${groups.ready.length} file${groups.ready.length === 1 ? '' : 's'}`}
            </Button>
          </div>
          {groups.attention.length > 0 && (
            <Card title="Please check these" subtitle="We were not sure about these. Choose the right school, teacher and kind, and they move to Ready.">
              <Rows items={groups.attention} onEdit={edit} onAdd={addSchool} dir={dir} />
            </Card>
          )}
          {(groups.ready.length > 0 || groups.working.length > 0) && <Card title="Ready to import"><Rows items={[...groups.working, ...groups.ready]} onEdit={edit} onAdd={addSchool} dir={dir} /></Card>}
          {groups.done.length > 0 && <Card title="Added to your records"><Rows items={groups.done} onEdit={edit} onAdd={addSchool} dir={dir} done /></Card>}
          {groups.other.length > 0 && <Card title="Not added" subtitle="Files you added before are skipped, so nothing is counted twice."><Rows items={groups.other} onEdit={edit} onAdd={addSchool} dir={dir} /></Card>}
        </>
      )}

      <Card tour="u-before" title="Files you added before">
        {recent.loading && !recent.data ? <Spinner /> : !recent.data?.length ? <Empty>Nothing added yet.</Empty> : (
          <ul className="divide-y divide-brand-50">
            {recent.data.map((b) => (
              <li key={b.id}>
                <button onClick={() => { router.replace(`/upload?batch=${b.id}`); }} className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700">
                  <span className="w-40 shrink-0 text-ink-500">{new Date(b.created_at).toLocaleString()}</span>
                  <span className="flex-1 truncate">{b.note || (b.origin === 'teacher' ? 'From a teacher' : 'Your files')} · {b.files} file{b.files === 1 ? '' : 's'}</span>
                  {b.attention > 0 && <Badge tone="warn">{b.attention} to check</Badge>}<Badge tone={b.status === 'done' ? 'good' : 'brand'}>{b.imported} added</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageShell>
  );
}

/** "Show allocation": which part of the file feeds which priority. Before Import it says what the kind of file feeds; after Import, exactly what was taken. */
function AllocationTable({ itemId, status }: { itemId: string; status: UploadItem['status'] }) {
  const [data, setData] = useState<Allocation | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { let live = true; setData(null); setErr(''); api.uploads.allocation(itemId).then((d) => live && setData(d)).catch((e) => live && setErr(String(e.message || e))); return () => { live = false; }; }, [itemId, status]);
  if (err) return <p className="mt-2 text-xs text-red-700">{err}</p>;
  if (!data) return <div className="mt-2"><Spinner label="Looking at the file…" /></div>;
  const mark = (c: AllocationRow['counted']) => c === 'yes' ? <Badge tone="good">Counted</Badge> : c === 'after_import' ? <Badge tone="brand">After Import</Badge> : <Badge tone="neutral">Not counted</Badge>;
  return (
    <div className="mt-2 rounded-2xl bg-brand-50/60 p-3">
      <p className="text-xs font-semibold text-ink-700">
        {data.state === 'done' ? (data.nothing ? 'Nothing from this file changes a priority.' : 'This is where the data of this file went:') : 'This is where the data of this file will go when you press Import:'}
      </p>
      <div className="thin-scroll mt-2 overflow-x-auto rounded-xl bg-surface ring-1 ring-brand-100">
        <table className="w-full min-w-[640px] text-start text-xs">
          <thead><tr className="bg-brand-50 text-ink-500">
            {['Priority it feeds', 'Data taken from the file', 'Records', 'Example from the file', 'Used?'].map((h) => <th key={h} scope="col" className="px-3 py-2 text-start font-semibold">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-brand-50">
            {data.rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 font-semibold text-ink-900">{r.priority}</td>
                <td className="px-3 py-2 text-ink-700">{r.takes}{r.note && <span className="mt-0.5 block text-ink-500">{r.note}</span>}</td>
                <td className="px-3 py-2 tabular-nums text-ink-700">{r.records ?? '–'}</td>
                <td dir="auto" className="px-3 py-2 text-ink-700">{r.example ?? '–'}</td>
                <td className="px-3 py-2">{mark(r.counted)}</td>
              </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** A file whose school is not on the list: either a new school we found in it (add it with its teachers and data), or no school at all. */
function DetectedPanel({ it, found, onAdd, onRemove }: { it: UploadItem; found: Detected; onAdd: (it: UploadItem, name: string, teachers: string[]) => Promise<void>; onRemove: () => void }) {
  const isNew = found.kind === 'new_school';
  const [view, setView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(isNew ? found.school.name : '');
  const [picked, setPicked] = useState<string[]>(isNew ? found.teachers : []);
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const add = async () => { setBusy(true); try { await onAdd(it, name, picked); } finally { setBusy(false); } };
  if (!isNew) {
    return (
      <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-tour="u-detected">
        <p className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} />No school detected</p>
        <p className="mt-1 text-xs">We could not find a school name in this file. Choose the school above to add the data to it, or do not upload this file.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => { const el = document.getElementById(`school-${it.id}`); el?.scrollIntoView({ block: 'center', behavior: 'smooth' }); (el as HTMLElement | null)?.focus(); }}>Add data: choose a school</Button>
          <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onRemove}>Remove data: don&apos;t upload</Button>
        </div>
      </div>
    );
  }
  const d = found.data;
  return (
    <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-tour="u-detected">
      <p className="flex items-start gap-2 font-semibold"><School size={16} className="shrink-0" /><span className="min-w-0 break-words">New school detected: <span dir="auto">{found.school.name}</span></span></p>
      <p className="mt-1 text-xs">This school is not on your list yet. You can add it with the teachers and the data we found, pick another school above, or not upload this file.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={() => setView((v) => !v)} aria-expanded={view}>{view ? 'Hide details' : 'View details'}</Button>
        <Button className="px-3 py-1.5 text-xs" busy={busy} disabled={name.trim().length < 3} onClick={add}>Add school and data</Button>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={onRemove}>Remove data: don&apos;t upload</Button>
      </div>
      {view && (
        <div className="mt-3 space-y-3 rounded-2xl bg-surface p-3 text-xs text-ink-700 ring-1 ring-amber-100">
          <div>
            <p className="font-semibold text-ink-900">School</p>
            <Input aria-label="School name" className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            <p className="mt-1 text-ink-500">{[found.school.school_type, found.school.board, found.school.medium].filter((x) => x && x !== 'Not stated').join(' · ') || 'Type, board and medium are not in the file; you can fill them in later.'} · Classes {found.school.grade_from} to {found.school.grade_to}</p>
          </div>
          <div>
            <p className="font-semibold text-ink-900">Teachers found in the file</p>
            {found.teachers.length === 0 ? <p className="mt-1 text-ink-500">No teacher names were found.</p> : (
              <ul className="mt-1 space-y-1">{found.teachers.map((t) => (
                <li key={t}><label className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} />{t}</label></li>))}</ul>)}
          </div>
          <div>
            <p className="font-semibold text-ink-900">Data found</p>
            <ul className="mt-1 list-disc ps-4">
              <li>Kind of file: {SECTION_NAME[d.section ?? 'other'] ?? 'Something else'}</li>
              <li>Date: {d.record_date ?? 'not found in the file'}</li>
              {d.table_rows ? <li>{d.table_rows} rows in its tables</li> : null}
            </ul>
            {it.preview && <p dir="auto" className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-xl bg-brand-50/60 p-2 text-ink-500">{it.preview.slice(0, 600)}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Rows({ items, onEdit, onAdd, dir, done }: { items: UploadItem[]; onEdit: (it: UploadItem, ch: Record<string, string | null>) => void; onAdd: (it: UploadItem, name: string, teachers: string[]) => Promise<void>; dir: ReturnType<typeof useDirectory>; done?: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const [alloc, setAlloc] = useState<Set<string>>(new Set());
  const flip = (id: string) => setAlloc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
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
              <button onClick={() => setOpen(open === it.id ? null : it.id)} className="rounded-full p-1 text-ink-400 hover:bg-brand-50" aria-label="Why we put it here"><ChevronDown size={16} /></button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <Select id={`school-${it.id}`} disabled={locked} value={it.school_id ?? ''} onChange={(e) => onEdit(it, { school_id: e.target.value || null, teacher_id: null })}>
                <option value="">Which school?</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
              <Select disabled={locked || !it.school_id} value={it.teacher_id ?? ''} onChange={(e) => onEdit(it, { teacher_id: e.target.value || null })}>
                <option value="">The whole school</option>{dir?.teachers.filter((t) => t.school_id === it.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select>
              <Select disabled={locked} value={it.section ?? 'other'} onChange={(e) => onEdit(it, { section: e.target.value })}>
                {SECTIONS.map((s) => <option key={s} value={s}>{SECTION_NAME[s]}</option>)}</Select>
              <div className="flex gap-2">
                <Input disabled={locked} type="date" value={it.record_date ?? ''} onChange={(e) => onEdit(it, { record_date: e.target.value })} />
                {!locked && it.status !== 'skipped' && <Button variant="ghost" className="px-2" onClick={() => onEdit(it, { status: 'skipped' })}>Skip</Button>}
              </div>
            </div>
            {it.status === 'needs_attention' && !it.school_id && it.detected && <DetectedPanel it={it} found={it.detected} onAdd={onAdd} onRemove={() => onEdit(it, { status: 'skipped' })} />}
            {done && (
              <div className="mt-2 text-sm text-ink-700">
                {counts.length > 0 ? <span>Found {counts.map(([k, v]) => `${v} ${COUNT_LABEL[k]}`).join(', ')}.</span> : <span className="text-ink-500">Saved with your files.</span>}
                {typeof it.result?.counts?.summary === 'string' && <p className="mt-1 text-ink-500">{it.result.counts.summary}</p>}
                {it.result?.warnings?.map((w, i) => <p key={i} className="mt-1 text-amber-700">⚠ {w}</p>)}
                {it.error && <p className="mt-1 text-red-700">{it.error}</p>}
              </div>
            )}
            {it.status !== 'duplicate' && it.status !== 'skipped' && it.status !== 'failed' && (
              <div className="mt-2">
                <button type="button" onClick={() => flip(it.id)} aria-expanded={alloc.has(it.id)} data-tour="u-allocation"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100">
                  <ListTree size={14} />{alloc.has(it.id) ? 'Hide allocation' : 'Show allocation'}
                </button>
                {alloc.has(it.id) && <AllocationTable itemId={it.id} status={it.status} />}
              </div>
            )}
            {open === it.id && (
              <div className="mt-2 rounded-2xl bg-brand-50/60 p-3 text-xs text-ink-700">
                <p className="font-semibold">Why we put it here:</p>
                <ul className="mt-1 list-disc ps-4">{(it.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}</ul>
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
