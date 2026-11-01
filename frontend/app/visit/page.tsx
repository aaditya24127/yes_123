'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, Eye, FileAudio, FileText, Loader2, Mic, Send, Sparkles, Trash2 } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import TextbookPanel from '@/components/TextbookPanel';
import AudioRecorder from '@/components/ui/AudioRecorder';
import ExtLink from '@/components/ui/ExtLink';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, List, Select, Spinner, Stepper, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Brief, Evaluation, Session } from '@/lib/types';
import { BAND } from '@/lib/theme';
import { BAND_WORD, PRACTICE, SCORE_WORD, fmtDay, issueName, sentences } from '@/lib/visit-text';

const STEPS = ['Before class', 'In class', 'Students', 'Results'];
const CHANGE: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  improved: { label: 'Better', tone: 'good' }, same: { label: 'Same', tone: 'warn' }, worse: { label: 'Worse', tone: 'bad' }, not_seen: { label: 'Not seen', tone: 'neutral' },
};
const LEVEL: Record<string, string> = { recall: 'Remember', understand: 'Understand', apply: 'Use it', reason: 'Think', foundational: 'Basic reading' };
const SEVERITY: Record<string, { label: string; tone: 'bad' | 'warn' | 'neutral' }> = { critical: { label: 'Big', tone: 'bad' }, significant: { label: 'Important', tone: 'warn' }, minor: { label: 'Small', tone: 'neutral' } };
const head = 'mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400';
type Pick = { school_id: string; teacher_id: string; class_no: string; subject: string; topic: string };

function VisitPage() {
  const params = useSearchParams(); const router = useRouter();
  const dir = useDirectory();
  const [pick, setPick] = useState<Pick>({ school_id: '', teacher_id: '', class_no: '', subject: '', topic: '' });
  const [brief, setBrief] = useState<Brief | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const recent = useLoad(() => api.visits.list(), []);

  const sid = params.get('session');
  useEffect(() => {
    if (sid && sid !== session?.id) api.visits.get(sid).then((s) => { setSession(s); setBrief(s.brief); setStep(Math.max(1, Math.min(3, s.stage - 1))); }).catch((e) => setError(e.message));
  }, [sid, session?.id]);
  const teacher = dir?.teachers.find((t) => t.id === pick.teacher_id);
  const reload = () => session && api.visits.get(session.id).then(setSession).catch(() => {});
  const pendingTranscripts = !!session?.media.some((m) => m.file_id && !m.transcript && !m.transcript_by && (m.kind === 'lesson_audio' || m.kind === 'student_answer'));
  const evaluating = !!session && session.job?.status !== undefined && ['queued', 'processing'].includes(session.job.status);
  usePoll(pendingTranscripts || evaluating, () => { reload(); });

  const run = async (label: string, fn: () => Promise<void>) => { setBusy(label); setError(''); try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };
  // The briefing appears at once (plain summary from the records); the sharper version follows a few seconds later and replaces it.
  const briefKey = useRef('');
  const loadBrief = (p: { teacher_id?: string; school_id?: string } = pick.teacher_id ? { teacher_id: pick.teacher_id } : { school_id: pick.school_id }) =>
    run('brief', async () => {
      const key = briefKey.current = `${p.teacher_id ?? ''}|${p.school_id ?? ''}`;
      setBrief(await api.visits.brief(p, true)); setStep(0);
      api.visits.brief(p).then((full) => { if (briefKey.current === key) setBrief((cur) => (cur ? { ...cur, brief: full.brief, brief_by: full.brief_by } : cur)); }).catch(() => {});
    });

  // Arriving from the "Visit" button on a school or teacher card: fill in who, and show the briefing straight away.
  const auto = useRef('');
  const qSchool = params.get('school'); const qTeacher = params.get('teacher');
  useEffect(() => {
    if (sid || !dir || !qSchool) return;
    const key = `${qSchool}:${qTeacher ?? ''}`;
    if (auto.current === key) return; auto.current = key;
    const t = qTeacher ? dir.teachers.find((x) => x.id === qTeacher) : undefined;
    setPick({ school_id: qSchool, teacher_id: qTeacher ?? '', class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '', topic: '' });
    loadBrief(qTeacher ? { teacher_id: qTeacher } : { school_id: qSchool });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dir, sid, qSchool, qTeacher]);

  // Choosing another teacher (or the whole school) after pressing Visit on a school card: fill in their class and subject and show their briefing.
  const pickTeacher = (id: string) => {
    const t = dir?.teachers.find((x) => x.id === id);
    setPick((p) => ({ ...p, teacher_id: id, class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '' }));
    loadBrief(id ? { teacher_id: id } : { school_id: pick.school_id || brief?.school.id });
  };
  const start = () => run('start', async () => {
    const s = await api.visits.start({ school_id: pick.school_id || brief?.school.id, teacher_id: pick.teacher_id || undefined, class_no: pick.class_no ? Number(pick.class_no) : null,
      subject: pick.subject || undefined, topic: pick.topic || undefined, brief_text: brief?.brief ?? undefined, brief_by: brief?.brief_by });
    setSession(s); setStep(1); router.replace(`/visit?session=${s.id}`); recent.reload();
  });
  const save = (body: Record<string, unknown>) => session && api.visits.edit(session.id, body).then(setSession).catch((e) => setError(e.message));
  // A new recording shows up straight away (you can play it at once) while it is saved in the background.
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const addAudio = (kind: string, extra: { question_index?: number; student_label?: string } = {}) => (blob: Blob, name: string) => {
    if (!session) return;
    const id = `p${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const url = URL.createObjectURL(blob);
    setPending((p) => [...p, { id, kind, question_index: extra.question_index ?? null, student_label: extra.student_label ?? null, name, url }]);
    api.visits.addMedia(session.id, blob, kind, extra, name).then(setSession).catch((e) => setError((e as Error).message))
      .finally(() => { setPending((p) => p.filter((x) => x.id !== id)); reload(); setTimeout(() => URL.revokeObjectURL(url), 10000); });
  };
  const waiting = (kind: string, qi?: number) => pending.filter((x) => x.kind === kind && (qi === undefined || x.question_index === qi));
  const startOver = () => { setSession(null); setBrief(null); setStep(0); auto.current = ''; router.replace('/visit'); };

  return (
    <PageShell title="School visit" subtitle="Four steps: get ready, watch the class, ask the students, then see the results.">
      <ErrorNote error={error} onClose={() => setError('')} />
      {!session && !brief && (
        <Card title="Who are you visiting?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="School"><Select value={pick.school_id} onChange={(e) => setPick({ ...pick, school_id: e.target.value, teacher_id: '' })}>
              <option value="">Choose a school…</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Teacher"><Select value={pick.teacher_id} disabled={!pick.school_id} onChange={(e) => {
              const t = dir?.teachers.find((x) => x.id === e.target.value);
              setPick({ ...pick, teacher_id: e.target.value, class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '' });
            }}><option value="">The whole school</option>{dir?.teachers.filter((t) => t.school_id === pick.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          </div>
          <div className="mt-4"><Button onClick={() => loadBrief()} busy={busy === 'brief'} disabled={!pick.school_id}>Continue</Button></div>
        </Card>
      )}

      {(brief || session) && <VisitHeader brief={(session?.brief ?? brief)!} session={session} pick={pick} onStartOver={startOver} />}
      {(brief || session) && (
        <Stepper steps={STEPS} current={session ? step : 0} maxReached={session ? Math.max(step, session.stage - 1) : 0} onPick={session ? setStep : undefined} />
      )}

      {brief && step === 0 && <BriefView b={brief} pick={pick} setPick={setPick} teacher={teacher} dir={dir} onStart={session ? undefined : start} busy={busy === 'start'}
        teachers={(dir?.teachers ?? []).filter((t) => t.school_id === brief.school.id)} onPickTeacher={pickTeacher} loading={busy === 'brief'} />}

      {session && step === 1 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Record the lesson" subtitle="Record on this phone, or add a recording. It is turned into text for you.">
            <AudioRecorder onDone={addAudio('lesson_audio')!} label="Record lesson" />
            <MediaList items={session.media.filter((m) => m.kind === 'lesson_audio')} waiting={waiting('lesson_audio')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <Card title="Your notes">
            <Field label="What did you see?"><TextArea defaultValue={session.crp_notes ?? ''} onBlur={(e) => save({ crp_notes: e.target.value })} rows={6}
              placeholder="Who answered, how the teacher checked understanding, use of materials, time on task…" /></Field>
            <Field label="What is different since the last visit?" className="mt-3"><TextArea defaultValue={session.changes_since_last ?? ''} onBlur={(e) => save({ changes_since_last: e.target.value })}
              placeholder="For example: reading corner now in use; group work started" /></Field>
            <div className="mt-3"><label className="cursor-pointer text-sm font-semibold text-brand-700 underline">Add a photo of written notes
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addAudio('crp_notes_file')!(f, f.name); e.target.value = ''; }} /></label></div>
            <MediaList items={session.media.filter((m) => m.kind === 'crp_notes_file')} waiting={waiting('crp_notes_file')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <div className="lg:col-span-2 flex justify-end"><Button onClick={() => { save({ stage: Math.max(3, session.stage) }); setStep(2); }}>Next: students</Button></div>
        </div>
      )}

      {session && step === 2 && (
        <>
          <Card title="Questions for students" subtitle="Ask 4 or 5 students: front, middle and back rows, girls and boys. Record each answer. Names are not saved."
            action={<Button variant="soft" icon={<Sparkles size={16} />} busy={busy === 'q'} onClick={() => run('q', async () => setSession(await api.visits.questions(session.id)))}>
              {session.questions.length ? 'New questions' : 'Get questions'}</Button>}>
            {session.question_tips?.length ? <div className="mb-4 rounded-2xl bg-brand-50/70 p-3"><p className={head}>Tips</p><List items={session.question_tips.filter(Boolean)} /></div> : null}
            {!session.questions.length ? <Empty>Press “Get questions”. They match today&apos;s topic, the lesson recording and the textbook.</Empty> : (
              <ol className="space-y-4">
                {session.questions.map((q, i) => {
                  const answers = session.media.filter((m) => m.kind === 'student_answer' && m.question_index === i);
                  const label = String.fromCharCode(65 + answers.length + waiting('student_answer', i).length);
                  return (
                    <li key={i} className="rounded-2xl border border-brand-100 p-4">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{LEVEL[q.level] ?? q.level}</Badge><span className="text-xs text-ink-400">Ask: {q.ask_who}</span></div>
                      <p className="mt-2 font-semibold text-ink-900">{i + 1}. {q.question}</p>
                      <p className="mt-1 text-sm text-ink-500"><b>A good answer:</b> {q.good_answer}</p>
                      <p className="text-sm text-ink-500"><b>Listen for:</b> {q.watch_for}</p>
                      <div className="mt-3"><AudioRecorder small label={`Record Student ${label}`}
                        onDone={addAudio('student_answer', { question_index: i, student_label: `Student ${label}` })!} /></div>
                      <MediaList items={answers} waiting={waiting('student_answer', i)} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <div className="flex justify-end"><Button onClick={() => { setStep(3); if (!session.result?.overall && !evaluating) run('eval', async () => setSession(await api.visits.evaluate(session.id))); }}>Next: results</Button></div>
        </>
      )}

      {session && step === 3 && <Results s={session} evaluating={evaluating || busy === 'eval'} onEvaluate={() => run('eval', async () => setSession(await api.visits.evaluate(session.id)))}
        onSaved={() => { reload(); recent.reload(); }} onPatch={save} setError={setError} />}

      {!session && !brief && (
        <Card title="Recent visits">
          {!recent.data?.length ? <Empty>No visits yet.</Empty> : (
            <ul className="divide-y divide-brand-50">
              {recent.data.map((v) => (
                <li key={v.id}><button className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700" onClick={() => router.replace(`/visit?session=${v.id}`)}>
                  <span className="w-28 shrink-0 text-ink-500">{fmtDay(v.started_at)}</span>
                  <span className="flex-1 truncate">{v.teacher_name ?? v.school_name}{v.class_no ? ` · Class ${v.class_no}` : ''}{v.subject ? ` ${v.subject}` : ''}{v.topic ? ` · ${v.topic}` : ''}</span>
                  <Badge tone={v.status === 'saved' ? 'good' : v.status === 'evaluated' ? 'brand' : 'neutral'}>{v.status === 'saved' ? 'Saved' : v.status === 'evaluated' ? 'Results ready' : `Step ${v.stage}`}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}

/** Who this visit is about. Shown at the top of every step. */
function VisitHeader({ brief, session, pick, onStartOver }: { brief: Brief; session: Session | null; pick: Pick; onStartOver: () => void }) {
  const band = brief.scores?.band ? BAND[brief.scores.band] : null;
  const cls = session?.class_no ?? (pick.class_no ? Number(pick.class_no) : null);
  const subject = session?.subject ?? pick.subject; const topic = session?.topic ?? pick.topic;
  const chips = [cls ? `Class ${cls}` : null, subject || null, topic || null, session ? fmtDay(session.started_at) : null].filter(Boolean) as string[];
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100">
      <div className="min-w-0 flex-1">
        <h2 className="font-serif text-2xl font-semibold text-ink-900">{brief.teacher?.name ?? brief.school.name}</h2>
        <p className="text-sm text-ink-500">{brief.teacher ? `${brief.teacher.designation} · ${brief.school.name}` : `${brief.school.board} · ${brief.school.medium} medium · Classes ${brief.school.grades}`}</p>
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="brand">{c}</Badge>)}</div>}
      </div>
      {band && brief.scores?.band && <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${band.chip}`}>{BAND_WORD[brief.scores.band]}</span>}
      {session && <Button variant="ghost" onClick={onStartOver}>Visit someone else</Button>}
    </div>
  );
}

function BriefView({ b, pick, setPick, teacher, dir, onStart, busy, teachers, onPickTeacher, loading }: {
  b: Brief; pick: Pick; setPick: (p: Pick) => void; teacher: { classes_taught: number[]; subjects_taught: string[] } | undefined; dir: ReturnType<typeof useDirectory>; onStart?: () => void; busy: boolean;
  teachers: { id: string; name: string }[]; onPickTeacher: (id: string) => void; loading: boolean;
}) {
  const point = (items: string[] | undefined, n = 3) => (items ?? []).filter(Boolean).slice(0, n);
  const summary = sentences(b.brief?.summary, 4);
  const columns: [string, string[], string][] = [
    ['Look at', point(b.brief?.focus_points), 'bg-sky-50/70'], ['Ask the teacher', point(b.brief?.ask_teacher), 'bg-amber-50/70'], ['Watch in class', point(b.brief?.check_in_class), 'bg-emerald-50/70'],
  ];
  // Earlier records for the chosen subject (and class) only. Records about other subjects are left out unless the person asks for them.
  const [allSubjects, setAllSubjects] = useState(false);
  const subj = allSubjects ? '' : pick.subject; const clsNo = allSubjects || !pick.class_no ? null : Number(pick.class_no);
  const subjOk = (x?: string | null) => !subj || (!!x && x.toLowerCase() === subj.toLowerCase());
  const clsOk = (c?: string | number | null) => {
    if (!clsNo || c === null || c === undefined || c === '') return true;
    const n = typeof c === 'number' ? c : Number(String(c).match(/\d+/)?.[0]);
    return !n || n === clsNo;
  };
  const issues = b.open_issues.filter((o) => subjOk(o.subject) && clsOk(o.class_label));
  const goodSeen = b.strengths_seen.filter((x) => subjOk(x.subject) && clsOk(x.class_label));
  const lastVisits = b.previous_sessions.filter((x) => subjOk(x.subject) && clsOk(x.cls));
  const results = b.latest_results.filter((r) => subjOk(r.subject) && clsOk(r.cls));
  const earlier = { open: issues.slice(0, 4), actions: b.open_actions.slice(0, 3), good: goodSeen.slice(0, 3), last: lastVisits.slice(0, 1) };
  const hasForSubject = issues.length + goodSeen.length + lastVisits.length + results.length > 0;
  const forWho = b.teacher?.name ?? b.school.name;
  const scope = subj ? `${subj}${clsNo ? `, Class ${clsNo}` : ''}` : '';
  const nothingBefore = !earlier.open.length && !earlier.actions.length && !earlier.good.length && !earlier.last.length;
  const classes = teacher?.classes_taught.length ? teacher.classes_taught : Array.from({ length: 10 }, (_, i) => i + 1);
  const subjects = teacher?.subjects_taught.length ? teacher.subjects_taught : ['Marathi', 'English', 'Hindi', 'Mathematics', 'EVS', 'Science', 'Social Science'];
  return (
    <div className="space-y-5">
      {b.alerts.length > 0 && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="shrink-0" />Needs your attention</p>
          <ul className="list-disc space-y-0.5 ps-6">{b.alerts.slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}</ul>
        </div>
      )}

      {onStart && (
        <Card title="Today's class" action={loading ? <Spinner label="Loading…" /> : undefined}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Teacher"><Select value={pick.teacher_id} onChange={(e) => onPickTeacher(e.target.value)}>
              <option value="">The whole school</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Class"><Select value={pick.class_no} onChange={(e) => setPick({ ...pick, class_no: e.target.value })}>
              <option value="">Not sure</option>{classes.map((c) => <option key={c} value={c}>Class {c}</option>)}</Select></Field>
            <Field label="Subject"><Select value={pick.subject} onChange={(e) => setPick({ ...pick, subject: e.target.value })}>
              <option value="">Not sure</option>{subjects.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Topic being taught today"><Input value={pick.topic} onChange={(e) => setPick({ ...pick, topic: e.target.value })} placeholder="For example: place value" /></Field>
          </div>
          <div className="mt-4"><Button onClick={onStart} busy={busy} icon={<Mic size={16} />}>Start the visit</Button></div>
        </Card>
      )}

      {summary.length > 0 && <Card title="In short"><List items={summary} /></Card>}

      <div className="grid gap-4 md:grid-cols-3">
        {columns.map(([title, items, tint]) => (
          <div key={title} className={`rounded-3xl p-5 ring-1 ring-brand-100 ${tint}`}>
            <h3 className="mb-2 font-serif text-lg font-semibold text-ink-900">{title}</h3>
            <List items={items} empty="Nothing special." />
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title={scope ? `Earlier records: ${scope}` : 'From earlier visits'} subtitle={scope ? `Only what is on record for ${forWho} in this subject.` : undefined}>
          {scope && !hasForSubject && (
            <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>Nothing on record for {forWho} in {scope}.</b> Records about other subjects are hidden.
              <button onClick={() => setAllSubjects(true)} className="ms-2 font-semibold underline">Show all subjects</button>
            </div>
          )}
          {allSubjects && pick.subject && <button onClick={() => setAllSubjects(false)} className="mb-3 text-sm font-semibold text-brand-700 underline">Show only {pick.subject}{pick.class_no ? `, Class ${pick.class_no}` : ''}</button>}
          {nothingBefore && !(scope && !hasForSubject) ? <p className="text-sm text-ink-400">Nothing on record yet.</p> : (
            <div className="space-y-4">
              {earlier.open.length > 0 && <div><p className={head}>Still to improve</p>
                <List items={earlier.open.map((o) => <span key={o.ref}>{issueName(o)} <span className="text-xs text-ink-400">since {fmtDay(o.since)}</span></span>)} /></div>}
              {earlier.actions.length > 0 && <div><p className={head}>We agreed to{scope ? ' (not tied to one subject)' : ''}</p>
                <List items={earlier.actions.map((a, i) => <span key={i}>{a.action} <span className={a.overdue_days ? 'text-xs font-semibold text-red-600' : 'text-xs text-ink-400'}>{a.overdue_days ? `${a.overdue_days} days late` : `by ${fmtDay(a.due)}`}</span></span>)} /></div>}
              {earlier.good.length > 0 && <div><p className={head}>Going well</p><List items={earlier.good.map((s) => s.point)} /></div>}
              {earlier.last.length > 0 && <div><p className={head}>Last time</p>
                <List items={earlier.last.flatMap((p) => sentences(p.overall, 2).map((x) => `${fmtDay(p.date)}: ${x}`))} /></div>}
            </div>
          )}
        </Card>
        <Card title={scope ? `Latest test results: ${scope}` : 'Latest test results'} subtitle="Students who need extra help">
          {!results.length ? <p className="text-sm text-ink-400">{scope ? `No test results on record for ${scope}.` : 'No results on record.'}</p> : (
            <ul className="space-y-2.5 text-sm">{results.slice(0, 6).map((r, i) => (
              <li key={i}>
                <div className="flex justify-between"><span>Class {r.cls} · {r.subject}</span><span className={`font-semibold ${r.below_pct >= 40 ? 'text-red-600' : r.below_pct >= 25 ? 'text-amber-700' : 'text-emerald-700'}`}>{r.below_pct} in 100 need help</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100"><div className={`h-full rounded-full ${r.below_pct >= 40 ? 'bg-red-500' : r.below_pct >= 25 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, r.below_pct)}%` }} /></div>
              </li>))}
            </ul>
          )}
          {b.pending_requests.length > 0 && <div className="mt-4"><p className={head}>Waiting from the teacher</p><List items={b.pending_requests.map((r) => r.title)} /></div>}
        </Card>
      </div>

      <details className="rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-ink-900">Textbook for this class (optional)</summary>
        <div className="mt-3"><TextbookPanel teacherId={b.teacher?.id} schoolId={b.school.id} defaults={{ class_no: pick.class_no ? Number(pick.class_no) : b.teacher?.classes[0], subject: pick.subject || b.teacher?.subjects[0], board: b.school.board, language: b.school.medium }} /></div>
      </details>
      {dir === null && <Spinner />}
    </div>
  );
}

type PendingMedia = { id: string; kind: string; question_index: number | null; student_label: string | null; name: string; url: string };

function MediaList({ items, waiting = [], onRemove }: { items: Session['media']; waiting?: PendingMedia[]; onRemove: (id: string) => void }) {
  if (!items.length && !waiting.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((m) => (
        <li key={m.id} className="rounded-2xl bg-brand-50/50 p-3 text-sm">
          <div className="flex items-center gap-2">
            {m.kind === 'crp_notes_file' ? <FileText size={15} className="shrink-0 text-brand-600" /> : <FileAudio size={15} className="shrink-0 text-brand-600" />}
            <span className="min-w-0 flex-1 truncate font-semibold">{m.student_label ?? m.name}</span>
            {m.kind === 'crp_notes_file' && m.file_id && <ExtLink href={api.rawUrl(m.file_id)} className="shrink-0 text-xs font-semibold text-brand-700 underline">Open</ExtLink>}
            {m.duration ? <span className="text-xs text-ink-400">{Math.round(m.duration)} s</span> : null}
            {m.file_id && m.kind !== 'crp_notes_file' && <audio controls preload="none" src={api.rawUrl(m.file_id)} className="h-8 max-w-[180px]" />}
            <button onClick={() => onRemove(m.id)} className="rounded-full p-1 text-ink-400 hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>
          </div>
          {m.transcript ? <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{m.transcript}</p>
            : m.transcript_by ? <p className="mt-2 text-xs text-amber-700">We could not turn this recording into text. Your notes can still be used.</p>
            : m.kind !== 'crp_notes_file' ? <p className="mt-2 flex items-center gap-1 text-xs text-ink-400"><Loader2 size={12} className="animate-spin" />Turning speech into text…</p> : null}
        </li>
      ))}
      {waiting.map((m) => (
        <li key={m.id} className="rounded-2xl bg-brand-50/50 p-3 text-sm">
          <div className="flex items-center gap-2">
            {m.kind === 'crp_notes_file' ? <FileText size={15} className="shrink-0 text-brand-600" /> : <FileAudio size={15} className="shrink-0 text-brand-600" />}
            <span className="min-w-0 flex-1 truncate font-semibold">{m.student_label ?? m.name}</span>
            {m.kind !== 'crp_notes_file' && <audio controls preload="auto" src={m.url} className="h-8 max-w-[180px]" />}
            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400"><Loader2 size={12} className="animate-spin" />Saving…</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Results({ s, evaluating, onEvaluate, onSaved, onPatch, setError }: {
  s: Session; evaluating: boolean; onEvaluate: () => void; onSaved: () => void; onPatch: (b: Record<string, unknown>) => void; setError: (e: string) => void;
}) {
  const r = s.result as Partial<Evaluation>;
  const [growth, setGrowth] = useState<Set<number>>(new Set());
  const [steps, setSteps] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(String(s.followup_days || 14));
  useEffect(() => { setGrowth(new Set((r.growth ?? []).map((_, i) => i))); setSteps(new Set((r.next_steps ?? []).map((_, i) => i))); }, [r.growth, r.next_steps]);
  useEffect(() => { setDays(String(s.followup_days || 14)); }, [s.followup_days]);
  const toggle = (set: Set<number>, i: number, fn: (x: Set<number>) => void) => { const n = new Set(set); n.has(i) ? n.delete(i) : n.add(i); fn(n); };
  const rubric = (r.rubric ?? []).filter((x) => x.score != null);

  if (evaluating) return <Card><Spinner label="Working out the results (recordings are turned into text first). This can take a minute…" /></Card>;
  if (r.error || s.job?.status === 'failed') return <Card><ErrorNote error="The results could not be made this time." /><div className="mt-3"><Button onClick={onEvaluate}>Try again</Button></div></Card>;
  if (!r.overall) return <Card><Empty>No results yet.</Empty><div className="mt-3 flex justify-center"><Button onClick={onEvaluate}>Get the results</Button></div></Card>;

  const n = Math.round(Number(days));
  const daysOk = Number.isFinite(n) && n >= 1 && n <= 365;
  const due = new Date(); due.setDate(due.getDate() + (daysOk ? n : 14));
  const locked = s.status === 'saved';
  const setFollow = (v: string) => { setDays(v); const k = Math.round(Number(v)); if (k >= 1 && k <= 365 && !locked) onPatch({ followup_days: k }); };
  const doSave = async () => {
    if (!daysOk) { setError('Choose how many days (1 to 365) before you follow up.'); return; }
    setBusy(true);
    try { const x = await api.visits.save(s.id, { growth: [...growth], next_steps: [...steps] }); setSaved(`Saved to your records: ${x.observations} observation(s) and ${x.actions} follow-up(s).`); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      {r.safety_flag && <ErrorNote error={`Please look at this first: ${r.safety_flag}`} />}
      <Card title="In short" action={r.confidence === 'low' ? <Badge tone="warn">Based on little information</Badge> : undefined}>
        <List items={sentences(r.overall, 5)} />
        {r.confidence === 'low' && <p className="mt-3 text-xs text-ink-500">Add a lesson recording or your notes in the earlier steps to get a fuller picture.</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What went well">
          {!(r.strengths ?? []).length ? <p className="text-sm text-ink-400">Nothing recorded.</p> : (
            <ul className="space-y-2.5">{(r.strengths ?? []).map((x) => (
              <li key={x.point} className="flex gap-2 text-sm"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span><b className="text-ink-900">{x.point}</b>{x.evidence && <span className="block text-xs text-ink-500">Seen: {sentences(x.evidence, 1)[0]}</span>}</span></li>))}</ul>
          )}
        </Card>
        <Card title="What to improve" subtitle={locked ? undefined : 'Tick the ones to keep track of.'}>
          {!(r.growth ?? []).length ? <p className="text-sm text-ink-400">Nothing big. Keep it up.</p> : (
            <ul className="space-y-4">{(r.growth ?? []).map((g, i) => (
              <li key={i} className="flex gap-3">
                <input type="checkbox" checked={growth.has(i)} disabled={locked} onChange={() => toggle(growth, i, setGrowth)} className="mt-1 h-4 w-4 accent-[rgb(var(--b600))]" aria-label={g.area} />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink-900">{g.area} <Badge tone={SEVERITY[g.severity]?.tone ?? 'neutral'}>{SEVERITY[g.severity]?.label ?? g.severity}</Badge></p>
                  <ul className="mt-1 space-y-0.5 text-ink-700">
                    <li>• <span className="text-ink-500">Seen:</span> {sentences(g.evidence, 1)[0]}</li>
                    <li>• <span className="font-semibold text-brand-800">Try:</span> {sentences(g.try_this, 1)[0]}</li>
                  </ul>
                </div>
              </li>))}</ul>
          )}
        </Card>
        <Card title="How the students did">
          <List items={sentences(r.students?.summary, 3)} empty="No student answers were recorded." />
          {(r.students?.per_question ?? []).length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">{(r.students?.per_question ?? []).map((q, i) => (
              <li key={i} className="rounded-2xl bg-brand-50/50 p-2.5"><p className="font-semibold text-ink-900">{q.question}</p><p className="text-ink-700">{q.verdict}{q.note ? <span className="text-xs text-ink-500"> · {sentences(q.note, 1)[0]}</span> : null}</p></li>))}</ul>
          )}
          {(r.students?.misconceptions ?? []).length > 0 && <div className="mt-3"><p className={head}>Ideas students mixed up</p><List items={r.students!.misconceptions} /></div>}
        </Card>
        <Card title="Compared with last visit">
          {!(r.compared_with_before ?? []).length ? <p className="text-sm text-ink-400">Nothing to compare yet.</p> : (
            <ul className="space-y-2.5">{(r.compared_with_before ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm"><Badge tone={CHANGE[c.change]?.tone ?? 'neutral'}>{CHANGE[c.change]?.label ?? c.change}</Badge>
                <span className="text-ink-900">{issueName({ issue: c.issue })}</span></li>))}</ul>
          )}
        </Card>
      </div>

      {rubric.length > 0 && (
        <Card title="Teaching practices" subtitle="1 is the lowest, 5 is the best. Left out if not seen.">
          <ul className="grid gap-2 sm:grid-cols-2">{rubric.map((x) => (
            <li key={x.element} className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/50 px-3 py-2 text-sm">
              <span className="text-ink-900">{PRACTICE[x.element] ?? x.element}</span>
              <span className="shrink-0 text-right"><b className="text-lg text-brand-800">{x.score}</b><span className="text-xs text-ink-500"> / 5 · {SCORE_WORD[x.score ?? 0] ?? ''}</span></span></li>))}</ul>
        </Card>
      )}

      <Card title="Agreed next steps" subtitle={locked ? undefined : 'Tick the steps you agreed with the teacher.'}>
        <ul className="space-y-2">{(r.next_steps ?? []).map((st, i) => (
          <li key={i} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={steps.has(i)} disabled={locked} onChange={() => toggle(steps, i, setSteps)} className="mt-1 h-4 w-4 accent-[rgb(var(--b600))]" aria-label={st.action} />
            <span className="flex-1">{st.action}{st.who ? <span className="text-ink-500"> ({st.who})</span> : null}</span></li>))}</ul>

        <div className="mt-5 rounded-2xl bg-brand-50/60 p-4">
          <p className="text-sm font-semibold text-ink-900">When will you follow up with the teacher?</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[7, 14, 21, 30].map((d) => (
              <button key={d} type="button" disabled={locked} onClick={() => setFollow(String(d))}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition disabled:opacity-60 ${Number(days) === d ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-ink-700 ring-brand-100 hover:ring-brand-300'}`}>{d} days</button>))}
            <span className="flex items-center gap-1.5 text-sm text-ink-500">or <Input type="number" min={1} max={365} disabled={locked} value={days} onChange={(e) => setFollow(e.target.value)} className="!w-20 text-center" aria-label="Number of days" /> days</span>
          </div>
          <p className="mt-2 text-xs text-ink-500">{daysOk ? <>Follow up by <b className="text-ink-700">{fmtDay(due)}</b>. The usual choice is 14 days.</> : 'Enter a number of days from 1 to 365.'}</p>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {locked ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />Saved to your records</span>
            : <><Button onClick={doSave} busy={busy} disabled={!daysOk}>Save to records</Button><Button variant="soft" onClick={onEvaluate}>Redo the results</Button></>}
          {saved && <span className="text-sm text-ink-700">{saved}</span>}
        </div>
      </Card>

      <ReportCard s={s} setError={setError} onSent={onSaved} />
    </div>
  );
}

/** The written report for the teacher: open or download the PDF, and send it to the teacher. */
function ReportCard({ s, setError, onSent }: { s: Session; setError: (e: string) => void; onSent: () => void }) {
  const [email, setEmail] = useState(s.brief.teacher?.email ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => { setEmail(s.brief.teacher?.email ?? ''); }, [s.brief.teacher?.email]);
  const send = async () => {
    setBusy(true); setResult('');
    try {
      const r = await api.visits.sendReport(s.id, email.trim());
      setResult(r.email === 'sent' ? `Sent to the teacher's app and by email to ${r.to}.`
        : r.email === 'failed' ? `Sent to the teacher's app. ${r.message}`
        : r.email === 'not_set_up' ? "Sent to the teacher's app. Email is not switched on yet, so no email went out." : "Sent to the teacher's app.");
      onSent();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Card title={<span className="flex items-center gap-2"><FileText size={18} className="text-brand-600" />Report for the teacher</span>}
      subtitle="A short PDF in simple points: what went well, where to improve, which questions to ask and how many, and what you agreed.">
      <div className="flex flex-wrap gap-2">
        <ExtLink href={api.visits.reportUrl(s.id)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><Eye size={16} />Generate report</ExtLink>
        <ExtLink href={api.visits.reportUrl(s.id, true)} className="inline-flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"><Download size={16} />Download PDF</ExtLink>
      </div>
      {s.teacher_id ? (
        <div className="mt-4 border-t border-brand-100 pt-4">
          <Field label="Send the report to the teacher by email" hint="It also appears in the teacher's app, with an alert.">
            <div className="flex flex-wrap gap-2">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teacher@example.com" className="min-w-[220px] flex-1" />
              <Button icon={<Send size={16} />} busy={busy} onClick={send}>Send to teacher</Button>
            </div>
          </Field>
          {result && <p role="status" className="mt-2 text-sm text-emerald-700">{result}</p>}
          {!result && s.report_sent_at && <p className="mt-2 text-xs text-ink-500">Last sent on {fmtDay(s.report_sent_at)}.</p>}
        </div>
      ) : <p className="mt-3 text-sm text-ink-500">This visit was for the whole school. Visit one teacher to send them a report.</p>}
    </Card>
  );
}

export default function Page() {
  return <Suspense fallback={null}><VisitPage /></Suspense>;
}
