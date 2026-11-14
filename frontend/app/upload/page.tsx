'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, Building2, CheckCircle2, ChevronDown, ClipboardCheck, Copy, FileText, GraduationCap, ListTree, Loader2, Mic, School, Table2, Users, XCircle } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import FileDrop from '@/components/ui/FileDrop';
import ExtLink from '@/components/ui/ExtLink';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, Note, Select, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { SECTIONS } from '@/lib/app.config';
import { refreshDirectory, useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Allocation, AllocationRow, Batch, Detected, UploadItem } from '@/lib/types';
import { useLang } from '@/lib/i18n';

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
  const { tr, dateTime } = useLang();
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

  const plural = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
  const next = groups.working.length ? tr('Adding your files…') : groups.attention.length ? tr('Next: check {plural} marked "Please check", then press Import.', { plural: plural(groups.attention.length) })
    : groups.ready.length ? tr('All set. Press Import to add {plural}.', { plural: plural(groups.ready.length) }) : groups.done.length ? tr('Done. Your files are in your records.') : '';
  return (
    <PageShell title={tr('Add files')} subtitle={tr('Add files. We sort them. You check, then press Import.')}>
      <ErrorNote error={error} onClose={() => setError('')} />
      {!batch && <Card tour="u-what" title={tr('What can you add?')} subtitle={tr('Add any file. We sort it and you check it.')}>
        <ul className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
          {KINDS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-2 rounded-2xl bg-brand-50/60 p-2.5 sm:gap-3 sm:p-3">
              <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-600 shadow-float min-[400px]:flex"><Icon size={18} /></span>
              <span><b className="block text-[13px] leading-snug text-ink-900 sm:text-sm">{tr(title)}</b><span className="hidden text-xs text-ink-500 sm:inline">{tr(text)}</span></span>
            </li>
          ))}
        </ul>
        <ol className="mt-4 flex flex-wrap gap-2 text-sm font-semibold text-ink-700">
          {[tr('Add your files'), tr('Check what we found'), tr('Press Import')].map((t, i) => (
            <li key={t} className="flex items-center gap-2 rounded-full bg-surface px-3 py-1.5 ring-1 ring-brand-100"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-[11px] text-white">{i + 1}</span>{tr(t)}</li>))}
        </ol>
      </Card>}
      <Card tour="u-drop">
        <FileDrop onFiles={send} title={busy ? tr('Reading your files…') : tr('Drop files here, or tap to choose')}
          hint={tr('Many files, or one zip. Nothing changes until you press Import.')} />
        <details className="mt-3">
          <summary className="-my-2 cursor-pointer py-2 text-sm font-semibold text-brand-700">{tr('All for one school? (optional)')}</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label={tr('School')}><Select value={hint.school_id} onChange={(e) => setHint({ ...hint, school_id: e.target.value, teacher_id: '' })}>
              <option value="">{tr('We will find it')}</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}</Select></Field>
            <Field label={tr('Teacher')}><Select value={hint.teacher_id} onChange={(e) => setHint({ ...hint, teacher_id: e.target.value })}>
              <option value="">{tr('We will find it')}</option>{dir?.teachers.filter((t) => !hint.school_id || t.school_id === hint.school_id).map((t) => <option key={t.id} value={t.id}>{tr(t.name)}</option>)}</Select></Field>
            <Field label={tr('Kind of file')}><Select value={hint.section} onChange={(e) => setHint({ ...hint, section: e.target.value })}>
              <option value="">{tr('We will find it')}</option>{SECTIONS.map((s) => <option key={s} value={s}>{tr(SECTION_NAME[s])}</option>)}</Select></Field>
          </div>
        </details>
        {busy && <div className="mt-3"><Spinner label={tr('Reading your files…')} /></div>}
      </Card>

      {batch && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="good">{tr('{length} ready', { length: groups.ready.length })}</Badge><Badge tone="warn">{tr('{length} to check', { length: groups.attention.length })}</Badge>
            <Badge tone="neutral">{tr('{length} skipped', { length: groups.other.length })}</Badge><Badge tone="brand">{tr('{length} added', { length: groups.done.length })}</Badge>
            <Button className="ms-auto" onClick={doImport} busy={busy || groups.working.length > 0} disabled={!groups.ready.length} title={groups.ready.length ? undefined : tr('Nothing is ready yet')}>
              {groups.working.length ? tr('Adding {length}…', { length: groups.working.length }) : (groups.ready.length === 1 ? tr('Import 1 file') : tr('Import {n} files', { n: groups.ready.length }))}
            </Button>
          </div>
          {next && <p className="text-sm font-semibold text-ink-700" aria-live="polite">{tr(next)}</p>}
          {groups.attention.length > 0 && (
            <Card title={tr('Please check these')} subtitle={tr('Choose a school for each. It then moves to Ready.')}>
              <Rows items={groups.attention} onEdit={edit} onAdd={addSchool} dir={dir} />
            </Card>
          )}
          {(groups.ready.length > 0 || groups.working.length > 0) && <Card title={tr('Ready to import')}><Rows items={[...groups.working, ...groups.ready]} onEdit={edit} onAdd={addSchool} dir={dir} /></Card>}
          {groups.done.length > 0 && <Card title={tr('Added to your records')}><Rows items={groups.done} onEdit={edit} onAdd={addSchool} dir={dir} done /></Card>}
          {groups.other.length > 0 && <Card title={tr('Not added')} subtitle={tr('Skipped, or added before. Nothing is counted twice.')}><Rows items={groups.other} onEdit={edit} onAdd={addSchool} dir={dir} /></Card>}
        </>
      )}

      <Card tour="u-before" title={tr('Files you added before')}>
        {recent.loading && !recent.data ? <Spinner /> : !recent.data?.length ? <Empty>{tr('Nothing added yet.')}</Empty> : (
          <ul className="divide-y divide-brand-50">
            {recent.data.map((b) => (
              <li key={b.id}>
                <button onClick={() => { router.replace(`/upload?batch=${b.id}`); }} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-start text-sm hover:text-brand-700">
                  <span className="shrink-0 text-ink-500 sm:w-40">{dateTime(b.created_at)}</span>
                  <span className="min-w-0 flex-1 basis-40 truncate">{b.note || (b.origin === 'teacher' ? tr('From a teacher') : tr('Your files'))} · {b.files === 1 ? tr('1 file') : tr('{n} files', { n: b.files })}</span>
                  <span className="flex shrink-0 items-center gap-2">{b.attention > 0 && <Badge tone="warn">{tr('{attention} to check', { attention: b.attention })}</Badge>}<Badge tone={b.status === 'done' ? 'good' : 'brand'}>{tr('{imported} added', { imported: b.imported })}</Badge></span>
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
  const { tr } = useLang();
  const [data, setData] = useState<Allocation | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { let live = true; setData(null); setErr(''); api.uploads.allocation(itemId).then((d) => live && setData(d)).catch((e) => live && setErr(String(e.message || e))); return () => { live = false; }; }, [itemId, status]);
  if (err) return <p className="mt-2 text-xs text-red-700">{tr(err)}</p>;
  if (!data) return <div className="mt-2"><Spinner label={tr('Looking at the file…')} /></div>;
  const mark = (c: AllocationRow['counted']) => c === 'yes' ? <Badge tone="good">{tr('Counted')}</Badge> : c === 'after_import' ? <Badge tone="brand">{tr('After Import')}</Badge> : <Badge tone="neutral">{tr('Not counted')}</Badge>;
  return (
    <div className="mt-2 rounded-2xl bg-brand-50/60 p-3">
      <p className="text-xs font-semibold text-ink-700">
        {data.state === 'done' ? (data.nothing ? tr('Nothing from this file changes a priority.') : tr('This is where the data of this file went:')) : tr('This is where the data of this file will go when you press Import:')}
      </p>
      <div className="thin-scroll mt-2 overflow-x-auto rounded-xl bg-surface ring-1 ring-brand-100">
        <table className="w-full min-w-[640px] text-start text-xs">
          <thead><tr className="bg-brand-50 text-ink-500">
            {[tr('Priority it feeds'), tr('Data taken from the file'), 'Records', tr('Example from the file'), 'Used?'].map((h) => <th key={h} scope="col" className="px-3 py-2 text-start font-semibold">{tr(h)}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-brand-50">
            {data.rows.map((r, i) => (
              <tr key={i} className="align-top">
                <td className="px-3 py-2 font-semibold text-ink-900">{tr(r.priority)}</td>
                <td className="px-3 py-2 text-ink-700">{tr(r.takes)}{r.note && <span className="mt-0.5 block text-ink-500">{tr(r.note)}</span>}</td>
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

/** A file whose school is not on the list: either a new school found in it (add it with its teachers and data), or no school at all. */
function DetectedPanel({ it, found: first, onAdd, onRemove }: { it: UploadItem; found: Detected; onAdd: (it: UploadItem, name: string, teachers: string[]) => Promise<void>; onRemove: () => void }) {
  const { tr } = useLang();
  const [found, setFound] = useState<Detected>(first);
  const isNew = found.kind === 'new_school';
  const [view, setView] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [name, setName] = useState(isNew ? found.school.name : '');
  const [picked, setPicked] = useState<string[]>(isNew ? found.teachers : []);
  const open = () => {
    setView((v) => !v);
    if (view || !isNew || found.data.found) return;
    setReading(true);                    // the file is read in the background after upload; this waits for it if it is not done yet
    api.uploads.found(it.id).then((d) => { setFound(d); setPicked((p) => Array.from(new Set([...p, ...d.teachers]))); }).catch(() => {}).finally(() => setReading(false));
  };
  const toggle = (t: string) => setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  const add = async () => { setBusy(true); try { await onAdd(it, name, picked); } finally { setBusy(false); } };
  if (!isNew) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" data-tour="u-detected">
        <p className="flex min-w-0 flex-1 items-start gap-2"><AlertTriangle size={16} className="mt-0.5 shrink-0" /><span><b className="block">{tr('No school found')}</b><span className="text-xs">{tr('Choose one above, or don\'t upload.')}</span></span></p>
        <Button variant="ghost" className="px-3 py-1 text-xs" onClick={onRemove}>{tr('Don\'t upload')}</Button>
      </div>
    );
  }
  const d = found.data; const f = d.found; const c = f?.counts;
  const date = f ? f.visit_date : d.record_date;
  const total = (c?.observations ?? 0) + (c?.actions ?? 0) + (c?.results ?? 0) + (c?.facts ?? 0);
  const known = [found.school.school_type, found.school.board, found.school.medium].filter((x) => x && x !== tr('Not stated'));
  const Group = ({ title, rows }: { title: string; rows: string[] }) => rows.length === 0 ? null : (
    <div className="mt-2"><p className="font-semibold text-ink-900">{tr(title)}</p><ul dir="auto" className="mt-0.5 list-disc space-y-0.5 ps-4">{rows.map((r, i) => <li key={i}>{tr(r)}</li>)}</ul></div>);
  return (
    <div className="mt-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-tour="u-detected">
      <p className="flex items-start gap-2 font-semibold"><School size={16} className="mt-0.5 shrink-0" /><span className="min-w-0 break-words">{tr('New school:')}{' '}<span dir="auto">{tr(found.school.name)}</span></span></p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant="soft" className="px-3 py-1.5 text-xs" onClick={open} aria-expanded={view}>{view ? tr('Hide details') : tr('View details')}</Button>
        <Button className="px-3 py-1.5 text-xs" busy={busy} disabled={name.trim().length < 3} onClick={add}>{tr('Add school and data')}</Button>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={onRemove}>{tr('Don\'t upload')}</Button>
      </div>
      {view && (
        <div className="mt-3 rounded-2xl bg-surface p-3 text-xs text-ink-700 ring-1 ring-amber-100">
          <p className="font-semibold text-ink-900">{tr('School name')}</p>
          <Input aria-label={tr('School name')} className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mt-1 text-ink-500">{[...known, tr('Classes {grade_from} to {grade_to}', { grade_from: found.school.grade_from, grade_to: found.school.grade_to })].join(' · ')}</p>

          <p className="mt-3 font-semibold text-ink-900">{tr('Teachers')}</p>
          {found.teachers.length === 0 ? <p className="mt-1 text-ink-500">{tr('None named in this file.')}</p> : (
            <ul className="mt-1 space-y-1">{found.teachers.map((t) => (
              <li key={t}><label className="flex items-center gap-2"><input type="checkbox" checked={picked.includes(t)} onChange={() => toggle(t)} /><span dir="auto">{tr(t)}</span></label></li>))}</ul>)}

          <p className="mt-3 font-semibold text-ink-900">{tr('What we found in this file')}</p>
          <p className="mt-1 text-ink-500">{SECTION_NAME[d.section ?? 'other'] ?? tr('Something else')} · {reading ? tr('reading the file…') : date ? tr('dated {date}', { date }) : tr('no date in the file (today is used)')}
            {total > 0 && ` · ${[c?.observations && (c.observations === 1 ? tr('1 note') : tr('{n} notes', { n: c.observations })), c?.actions && (c.actions === 1 ? tr('1 action') : tr('{n} actions', { n: c.actions })), c?.results && (c.results === 1 ? tr('1 test result') : tr('{n} test results', { n: c.results })), c?.facts && (c.facts === 1 ? tr('1 number') : tr('{n} numbers', { n: c.facts }))].filter(Boolean).join(', ')}`}</p>
          {reading && <div className="mt-2"><Spinner label={tr('Reading the file. This can take a minute…')} /></div>}
          {f?.summary && <p dir="auto" className="mt-1">{tr(f.summary)}</p>}
          <Group title={tr('Notes')} rows={(f?.observations ?? []).map((o) => [o.level && `${o.level}:`, o.text, o.where && `(${o.where})`].filter(Boolean).join(' '))} />
          <Group title={tr('Actions')} rows={(f?.actions ?? []).map((a) => (a.due ? `${a.text} (by ${a.due})` : a.text))} />
          <Group title={tr('Test results')} rows={f?.results ?? []} />
          <Group title={tr('School numbers')} rows={f?.facts ?? []} />
          {total === 0 && <Group title={tr('From the file')} rows={f?.notes ?? []} />}
          {!reading && total === 0 && (f?.notes ?? []).length === 0 && <p className="mt-2 text-ink-500">{tr('Nothing readable was found in this file.')}</p>}
          <p className="mt-3"><ExtLink href={api.connect.uploadedFileUrl(it.id)} className="font-semibold text-brand-700 underline">{tr('Open the file')}</ExtLink></p>
        </div>
      )}
    </div>
  );
}

const fmtDate = (d: string) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

function Rows({ items, onEdit, onAdd, dir, done }: { items: UploadItem[]; onEdit: (it: UploadItem, ch: Record<string, string | null>) => void; onAdd: (it: UploadItem, name: string, teachers: string[]) => Promise<void>; dir: ReturnType<typeof useDirectory>; done?: boolean }) {
  const { tr } = useLang();
  const [open, setOpen] = useState<string | null>(null);
  const [alloc, setAlloc] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Set<string>>(new Set());
  const flipNotes = (id: string) => setNotes((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const flipMore = (id: string) => setMore((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const flip = (id: string) => setAlloc((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <ul className="divide-y divide-brand-50">
      {items.map((it) => {
        const st = STATUS[it.status]; const canEdit = it.status === 'sorted' || it.status === 'needs_attention';
        const counts = Object.entries(it.result?.counts ?? {}).filter(([k, v]) => typeof v === 'number' && COUNT_LABEL[k] && !k.includes('_valid'));
        return (
          <li key={it.id} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              {it.status === 'importing' ? <Loader2 size={16} className="animate-spin text-brand-600" /> : it.status === 'imported' ? <CheckCircle2 size={16} className="text-emerald-600" />
                : it.status === 'failed' ? <XCircle size={16} className="text-red-600" /> : it.status === 'duplicate' ? <Copy size={16} className="text-ink-400" />
                : it.status === 'needs_attention' ? <AlertTriangle size={16} className="text-amber-600" /> : <FileText size={16} className="text-brand-600" />}
              <span className="min-w-0 flex-1 truncate font-semibold text-ink-900" title={tr(it.name)}>{tr(it.name)}</span>
              <Badge tone={st.tone}>{tr(st.label)}</Badge>
              <button onClick={() => setOpen(open === it.id ? null : it.id)} className="rounded-full p-1 text-ink-400 hover:bg-brand-50" aria-label={tr('Why we put it here')}><ChevronDown size={16} /></button>
            </div>
            <p className="mt-0.5 ps-6 text-xs text-ink-500">
              {[it.school_name ?? (it.status === 'needs_attention' || it.status === 'sorted' ? tr('No school yet') : null), it.teacher_name, SECTION_NAME[it.section ?? 'other'], it.record_date && fmtDate(it.record_date)].filter(Boolean).join(' · ')}
            </p>
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(it.status === 'needs_attention' || more.has(it.id)) && (
                  <Select id={`school-${it.id}`} className="w-full sm:w-72" value={it.school_id ?? ''} onChange={(e) => onEdit(it, { school_id: e.target.value || null, teacher_id: null })}>
                    <option value="">{tr('Which school?')}</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}</Select>)}
                <button type="button" onClick={() => flipMore(it.id)} aria-expanded={more.has(it.id)} className="text-xs font-semibold text-brand-700 underline">{more.has(it.id) ? tr('Fewer options') : tr('Edit details')}</button>
              </div>
            )}
            {canEdit && more.has(it.id) && (
              <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
                <Select disabled={!it.school_id} value={it.teacher_id ?? ''} onChange={(e) => onEdit(it, { teacher_id: e.target.value || null })}>
                  <option value="">{tr('The whole school')}</option>{dir?.teachers.filter((t) => t.school_id === it.school_id).map((t) => <option key={t.id} value={t.id}>{tr(t.name)}</option>)}</Select>
                <Select value={it.section ?? 'other'} onChange={(e) => onEdit(it, { section: e.target.value })}>
                  {SECTIONS.map((s) => <option key={s} value={s}>{tr(SECTION_NAME[s])}</option>)}</Select>
                <Input type="date" value={it.record_date ?? ''} onChange={(e) => onEdit(it, { record_date: e.target.value })} />
                <Button variant="ghost" className="px-3" onClick={() => onEdit(it, { status: 'skipped' })}>{tr('Skip')}</Button>
              </div>
            )}
            {it.status === 'needs_attention' && !it.school_id && it.detected && <DetectedPanel it={it} found={it.detected} onAdd={onAdd} onRemove={() => onEdit(it, { status: 'skipped' })} />}
            {done && (
              <div className="mt-2 ps-6 text-sm text-ink-700">
                {counts.length > 0 ? <span>{tr('Found {list}.', { list: counts.map(([k, v]) => `${v} ${tr(COUNT_LABEL[k])}`).join(', ') })}</span> : <span className="text-ink-500">{tr('Saved with your files.')}</span>}
                {(() => {
                  const sum = typeof it.result?.counts?.summary === 'string' ? it.result.counts.summary : '';
                  const warns = it.result?.warnings ?? [];
                  const first = sum ? (sum.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? sum) : '';
                  const short = first.length > 130 ? `${first.slice(0, 127).trimEnd()}…` : first;
                  const extra = (sum && sum !== short) || warns.length > 0;
                  return (
                    <>
                      {short && <p dir="auto" className="mt-1 text-xs text-ink-500">{tr(short)}</p>}
                      {extra && <button type="button" onClick={() => flipNotes(it.id)} aria-expanded={notes.has(it.id)} className="mt-1 text-xs font-semibold text-brand-700 underline">{notes.has(it.id) ? tr('Hide notes') : tr('More notes')}</button>}
                      {extra && notes.has(it.id) && (
                        <div dir="auto" className="mt-1 rounded-xl bg-brand-50/60 p-2 text-xs text-ink-600">
                          {sum && sum !== short && <p>{tr(sum)}</p>}
                          {warns.map((w, i) => <p key={i} className="mt-1 text-amber-700">⚠ {tr(w)}</p>)}
                        </div>
                      )}
                    </>
                  );
                })()}
                {it.error && <p className="mt-1 text-red-700">{tr(it.error)}</p>}
              </div>
            )}
            {it.status !== 'duplicate' && it.status !== 'skipped' && it.status !== 'failed' && (
              <div className="mt-2">
                <button type="button" onClick={() => flip(it.id)} aria-expanded={alloc.has(it.id)} data-tour="u-allocation"
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100">
                  <ListTree size={14} />{alloc.has(it.id) ? tr('Hide allocation') : tr('Show allocation')}
                </button>
                {alloc.has(it.id) && <AllocationTable itemId={it.id} status={it.status} />}
              </div>
            )}
            {open === it.id && (
              <div className="mt-2 rounded-2xl bg-brand-50/60 p-3 text-xs text-ink-700">
                <p className="font-semibold">{tr('Why we put it here:')}</p>
                <ul className="mt-1 list-disc ps-4">{(it.reasons ?? []).map((r, i) => <li key={i}>{tr(r)}</li>)}</ul>
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
