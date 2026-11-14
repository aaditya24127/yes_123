'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Download, Eye, FileAudio, FileText, Loader2, Mic, Send, Sparkles, Trash2 } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import AssessmentPanel from '@/components/AssessmentPanel';
import ChapterSelect from '@/components/ChapterSelect';
import NotesBox from '@/components/NotesBox';
import TextbookPanel from '@/components/TextbookPanel';
import TeacherReportCard from '@/components/TeacherReportCard';
import AudioRecorder from '@/components/ui/AudioRecorder';
import ExtLink from '@/components/ui/ExtLink';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, List, Select, Spinner, Stepper, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useUser } from '@/lib/auth';
import { useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Brief, Evaluation, Session } from '@/lib/types';
import { BAND } from '@/lib/theme';
import { BAND_WORD, PRACTICE, SCORE_WORD, fmtDay, issueName, sentences } from '@/lib/visit-text';
import { useLang } from '@/lib/i18n';

const STEPS = ['Before class', 'In class', 'Students', 'Results'];
const CHANGE: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  improved: { label: 'Better', tone: 'good' }, same: { label: 'Same', tone: 'warn' }, worse: { label: 'Worse', tone: 'bad' }, not_seen: { label: 'Not seen', tone: 'neutral' },
};
const LEVEL: Record<string, string> = { recall: 'Remember', understand: 'Understand', apply: 'Use it', reason: 'Think', foundational: 'Basic reading' };
const SEVERITY: Record<string, { label: string; tone: 'bad' | 'warn' | 'neutral' }> = { critical: { label: 'Big', tone: 'bad' }, significant: { label: 'Important', tone: 'warn' }, minor: { label: 'Small', tone: 'neutral' } };
const head = 'mb-1.5 text-xs font-semibold uppercase tracking-wider text-ink-400';
type Pick = { school_id: string; teacher_id: string; class_no: string; subject: string; topic: string };

function VisitPage() {
  const { tr } = useLang();
  const params = useSearchParams(); const router = useRouter();
  const dir = useDirectory();
  const [pick, setPick] = useState<Pick>({ school_id: '', teacher_id: '', class_no: '', subject: '', topic: '' });
  const [brief, setBrief] = useState<Brief | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const recent = useLoad(() => api.visits.list(), [], 'visits:recent');

  const sid = params.get('session');
  useEffect(() => {
    if (sid && sid !== session?.id) api.visits.get(sid).then((s) => { setSession(s); setBrief(s.brief); setStep(Math.max(1, Math.min(3, s.stage - 1))); }).catch((e) => setError(e.message));
  }, [sid, session?.id]);
  const teacher = dir?.teachers.find((t) => t.id === pick.teacher_id);
  const reload = () => session && api.visits.get(session.id).then(setSession).catch(() => {});
  const pendingTranscripts = !!session?.media.some((m) => m.file_id && !m.transcript && !m.transcript_by && (m.kind === 'lesson_audio' || m.kind === 'student_answer'));
  const evaluating = !!session && session.job?.status !== undefined && ['queued', 'processing'].includes(session.job.status);
  usePoll(pendingTranscripts || evaluating, () => { reload(); }, pendingTranscripts ? 1500 : undefined);

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
    setPick((p) => ({ ...p, teacher_id: id, class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '', topic: '' }));
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
    <PageShell title={tr('School visit')} subtitle={tr('Four steps: get ready, watch the class, ask the students, then see the results.')}>
      <ErrorNote error={error} onClose={() => setError('')} />
      {!session && !brief && (
        <Card tour="v-who" title={tr('Who are you visiting?')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={tr('School')}><Select value={pick.school_id} onChange={(e) => setPick({ ...pick, school_id: e.target.value, teacher_id: '' })}>
              <option value="">{tr('Choose a school…')}</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{tr(s.name)}</option>)}</Select></Field>
            <Field label={tr('Teacher')}><Select value={pick.teacher_id} disabled={!pick.school_id} onChange={(e) => {
              const t = dir?.teachers.find((x) => x.id === e.target.value);
              setPick({ ...pick, teacher_id: e.target.value, class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '' });
            }}><option value="">{tr('The whole school')}</option>{dir?.teachers.filter((t) => t.school_id === pick.school_id).map((t) => <option key={t.id} value={t.id}>{tr(t.name)}</option>)}</Select></Field>
          </div>
          <div className="mt-4"><Button onClick={() => loadBrief()} busy={busy === 'brief'} disabled={!pick.school_id}>{tr('Continue')}</Button></div>
        </Card>
      )}

      {(brief || session) && <VisitHeader brief={(session?.brief ?? brief)!} session={session} pick={pick} onStartOver={startOver} />}
      {(brief || session) && (
        <Stepper steps={STEPS} current={session ? step : 0} maxReached={session ? Math.max(step, session.stage - 1) : 0} onPick={session ? setStep : undefined} />
      )}
      {session && step >= 1 && <WhoStrip session={session} />}

      {brief && step === 0 && <BriefView b={brief} pick={pick} setPick={setPick} teacher={teacher} dir={dir} onStart={session ? undefined : start} busy={busy === 'start'}
        teachers={(dir?.teachers ?? []).filter((t) => t.school_id === brief.school.id)} onPickTeacher={pickTeacher} loading={busy === 'brief'} />}

      {session && step === 1 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card tour="v-record" title={tr('Record the lesson')} subtitle={tr('Record on this phone, or add a recording. It is turned into text for you.')}>
            <AudioRecorder checkSound onDone={addAudio('lesson_audio')!} label={tr('Record lesson')} />
            <MediaList items={session.media.filter((m) => m.kind === 'lesson_audio')} waiting={waiting('lesson_audio')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <Card tour="v-notes" title={tr('Your notes')}>
            <NotesBox key={session.id} value={session.crp_notes ?? ''} onSave={(t) => save({ crp_notes: t })} setError={setError} />
            <Field label={tr('What is different since the last visit?')} className="mt-3"><TextArea defaultValue={session.changes_since_last ?? ''} onBlur={(e) => save({ changes_since_last: e.target.value })}
              placeholder={tr('For example: reading corner now in use; group work started')} /></Field>
            <MediaList items={session.media.filter((m) => m.kind === 'crp_notes_file')} waiting={waiting('crp_notes_file')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <div className="lg:col-span-2 flex justify-end"><Button data-tour="v-next-students" onClick={() => { save({ stage: Math.max(3, session.stage) }); setStep(2); }}>{tr('Next: students')}</Button></div>
        </div>
      )}

      {session && step === 2 && (
        <>
          <Card tour="v-questions" title={tr('Questions for students')} subtitle={tr('Ask 4 or 5 students: front, middle and back rows, girls and boys. Record each answer. Names are not saved.')}
            action={<Button data-tour="v-get-questions" variant="soft" icon={<Sparkles size={16} />} busy={busy === 'q'} onClick={() => run('q', async () => setSession(await api.visits.questions(session.id)))}>
              {session.questions.length ? tr('New questions') : tr('Get questions')}</Button>}>
            {session.question_tips?.length ? <div className="mb-4 rounded-2xl bg-brand-50/70 p-3"><p className={head}>{tr('Tips')}</p><List items={session.question_tips.filter(Boolean)} /></div> : null}
            {!session.questions.length ? <Empty>{tr('Press “Get questions”. They match today\'s topic, the lesson recording and the textbook.')}</Empty> : (
              <ol className="space-y-4">
                {session.questions.map((q, i) => {
                  const answers = session.media.filter((m) => m.kind === 'student_answer' && m.question_index === i);
                  const label = String.fromCharCode(65 + answers.length + waiting('student_answer', i).length);
                  return (
                    <li key={i} data-tour="v-question-item" className="rounded-2xl border border-brand-100 p-4">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{LEVEL[q.level] ?? q.level}</Badge><span className="text-xs text-ink-400">{tr('Ask: {ask_who}', { ask_who: q.ask_who })}</span></div>
                      <p className="mt-2 font-semibold text-ink-900">{i + 1}. {tr(q.question)}</p>
                      <p className="mt-1 text-sm text-ink-500"><b>{tr('A good answer:')}</b> {tr(q.good_answer)}</p>
                      <p className="text-sm text-ink-500"><b>{tr('Listen for:')}</b> {tr(q.watch_for)}</p>
                      <div className="mt-3"><AudioRecorder small checkSound label={tr('Record Student {label}', { label })}
                        onDone={addAudio('student_answer', { question_index: i, student_label: tr('Student {label}', { label }) })!} /></div>
                      <MediaList items={answers} waiting={waiting('student_answer', i)} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <div className="flex justify-end"><Button data-tour="v-next-results" onClick={() => { setStep(3); if (!session.result?.overall && !evaluating) run('eval', async () => setSession(await api.visits.evaluate(session.id))); }}>{tr('Next: results')}</Button></div>
        </>
      )}

      {session && step === 3 && <Results s={session} evaluating={evaluating || busy === 'eval'} onEvaluate={() => run('eval', async () => setSession(await api.visits.evaluate(session.id)))}
        onSaved={() => { reload(); recent.reload(); }} onPatch={save} setError={setError} />}

      {!session && !brief && (
        <Card tour="v-recent" title={tr('Recent visits')}>
          {!recent.data?.length ? <Empty>{tr('No visits yet.')}</Empty> : (
            <ul className="divide-y divide-brand-50">
              {recent.data.map((v) => (
                <li key={v.id}><button className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700" onClick={() => router.replace(`/visit?session=${v.id}`)}>
                  <span className="w-28 shrink-0 text-ink-500">{fmtDay(v.started_at)}</span>
                  <span className="flex-1 truncate">{v.teacher_name ?? v.school_name}{v.class_no ? tr(' · Class {class_no}', { class_no: v.class_no }) : ''}{v.subject ? ` ${v.subject}` : ''}{v.topic ? ` · ${v.topic}` : ''}{v.mentor_name ? <span className="text-xs text-ink-400"> · {tr(v.mentor_name)}</span> : null}</span>
                  <Badge tone={v.status === 'saved' ? 'good' : v.status === 'evaluated' ? 'brand' : 'neutral'}>{v.status === 'saved' ? tr('Saved') : v.status === 'evaluated' ? tr('Results ready') : tr('Step {stage}', { stage: v.stage })}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}

/** A slim bar that stays at the top while the visit goes on: who is being evaluated (it never scrolls out of sight, also on a phone). */
function WhoStrip({ session }: { session: Session }) {
  const { tr } = useLang();
  const b = session.brief; const who = b.teacher?.name ?? b.school.name;
  const bits = [session.class_no ? tr('Class {class_no}', { class_no: session.class_no }) : null, session.subject, session.topic].filter(Boolean) as string[];
  return (
    <div data-tour="v-who-strip" className="sticky top-1 z-30 -mt-1 flex min-w-0 items-center gap-2 rounded-2xl bg-surface/95 px-4 py-2 text-sm shadow-float ring-1 ring-brand-100 backdrop-blur">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-ink-400">{tr('Evaluating')}</span>
      <span className="min-w-0 flex-1 truncate"><b className="text-ink-900">{tr(who)}</b>{bits.length > 0 && <span className="text-ink-500"> · {bits.join(' · ')}</span>}</span>
    </div>
  );
}

/** Who this visit is about. Shown at the top of every step. */
function VisitHeader({ brief, session, pick, onStartOver }: { brief: Brief; session: Session | null; pick: Pick; onStartOver: () => void }) {
  const { tr } = useLang();
  const band = brief.scores?.band ? BAND[brief.scores.band] : null;
  const cls = session?.class_no ?? (pick.class_no ? Number(pick.class_no) : null);
  const subject = session?.subject ?? pick.subject; const topic = session?.topic ?? pick.topic;
  const chips = [cls ? tr('Class {cls}', { cls }) : null, subject || null, topic || null, session ? fmtDay(session.started_at) : null].filter(Boolean) as string[];
  return (
    <div data-tour="v-header" className="flex flex-col gap-3 rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
      <div className="min-w-0 sm:flex-1">
        <h2 className="font-serif text-xl font-semibold text-ink-900 sm:text-2xl">{brief.teacher?.name ?? brief.school.name}</h2>
        <p className="text-sm text-ink-500">{brief.teacher ? `${brief.teacher.designation} · ${brief.school.name}` : tr('{board} · {medium} medium · Classes {grades}', { board: brief.school.board, medium: brief.school.medium, grades: brief.school.grades })}</p>
        {chips.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{chips.map((c) => <Badge key={c} tone="brand">{tr(c)}</Badge>)}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:contents">
        {band && brief.scores?.band && <span className={`whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold ring-1 ${band.chip}`}>{tr(BAND_WORD[brief.scores.band])}</span>}
        {session && <Button variant="ghost" className="whitespace-nowrap" onClick={onStartOver}>{tr('Visit someone else')}</Button>}
      </div>
    </div>
  );
}

function BriefView({ b, pick, setPick, teacher, dir, onStart, busy, teachers, onPickTeacher, loading }: {
  b: Brief; pick: Pick; setPick: (p: Pick) => void; teacher: { classes_taught: number[]; subjects_taught: string[] } | undefined; dir: ReturnType<typeof useDirectory>; onStart?: () => void; busy: boolean;
  teachers: { id: string; name: string }[]; onPickTeacher: (id: string) => void; loading: boolean;
}) {
  const { tr, tn } = useLang();
  const point = (items: string[] | undefined, n = 3) => (items ?? []).filter(Boolean).slice(0, n);
  const [tab, setTab] = useState<'summary' | 'history' | 'results' | 'books'>('summary');
  const summary = sentences(b.brief?.summary, 4);
  const columns: [string, string[], string][] = [
    [tr('Look at'), point(b.brief?.focus_points), 'bg-sky-50/70'], [tr('Ask the teacher'), point(b.brief?.ask_teacher), 'bg-amber-50/70'], [tr('Watch in class'), point(b.brief?.check_in_class), 'bg-emerald-50/70'],
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
  const me = useUser()?.name ?? '';        // so the CRP's own earlier visits say "you"
  const scope = subj ? `${subj}${clsNo ? `, Class ${clsNo}` : ''}` : '';
  const nothingBefore = !earlier.open.length && !earlier.actions.length && !earlier.good.length && !earlier.last.length;
  const classes = teacher?.classes_taught.length ? teacher.classes_taught : Array.from({ length: 10 }, (_, i) => i + 1);
  const subjects = teacher?.subjects_taught.length ? teacher.subjects_taught : ['Marathi', 'English', 'Hindi', 'Mathematics', 'EVS', 'Science', tr('Social Science')];
  return (
    <div className="space-y-5">
      {b.alerts.length > 0 && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p className="mb-1 flex items-center gap-2 font-semibold"><AlertTriangle size={16} className="shrink-0" />{tr('Needs your attention')}</p>
          <ul className="list-disc space-y-0.5 ps-6">{b.alerts.slice(0, 4).map((a, i) => <li key={i}>{tn(a)}</li>)}</ul>
        </div>
      )}

      {onStart && (
        <Card tour="v-today" title={tr('Today\'s class')} action={loading ? <Spinner label={tr('Loading…')} /> : undefined}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={tr('Teacher')}><Select data-tour="v-teacher" value={pick.teacher_id} onChange={(e) => onPickTeacher(e.target.value)}>
              <option value="">{tr('The whole school')}</option>{teachers.map((t) => <option key={t.id} value={t.id}>{tr(t.name)}</option>)}</Select></Field>
            <Field label={tr('Class')}><Select value={pick.class_no} onChange={(e) => setPick({ ...pick, class_no: e.target.value, topic: '' })}>
              <option value="">{tr('Not sure')}</option>{classes.map((c) => <option key={c} value={c}>{tr('Class {c}', { c })}</option>)}</Select></Field>
            <Field label={tr('Subject')}><Select value={pick.subject} onChange={(e) => setPick({ ...pick, subject: e.target.value, topic: '' })}>
              <option value="">{tr('Not sure')}</option>{subjects.map((s) => <option key={s}>{tr(s)}</option>)}</Select></Field>
            <ChapterSelect schoolId={b.school.id} classNo={pick.class_no ? Number(pick.class_no) : null} subject={pick.subject} value={pick.topic} onChange={(topic) => setPick({ ...pick, topic })} />
          </div>
          <div className="mt-4"><Button data-tour="v-start" onClick={onStart} busy={busy} icon={<Mic size={16} />}>{tr('Start the visit')}</Button></div>
        </Card>
      )}

      {onStart && b.teacher && (
        <AssessmentPanel teacher={{ id: b.teacher.id, name: b.teacher.name }} classNo={pick.class_no ? Number(pick.class_no) : null} subject={pick.subject} chapter={pick.topic} />
      )}

      <div role="tablist" aria-label={tr('About this visit')} className="flex flex-wrap gap-2">
        {([['summary', 'Summary'], ['history', 'History'], ['results', tr('Test results')], ['books', 'Textbook']] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold ring-1 transition ${tab === k ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-brand-700 ring-brand-100 hover:bg-brand-50'}`}>{tr(label)}</button>))}
      </div>

      {tab === 'summary' && summary.length > 0 && <Card title={tr('In short')}><List items={summary} /></Card>}

      {tab === 'summary' && lastVisits.some((p) => p.mentor && !(me && p.mentor.includes(me))) && (
        <button type="button" onClick={() => setTab('history')} className="flex w-full items-center justify-between gap-3 rounded-3xl bg-brand-50 px-5 py-3 text-start text-sm ring-1 ring-brand-100 transition hover:bg-brand-100">
          <span><b className="text-ink-900">{tr('Other CRPs have visited {forWho} before.', { forWho })}</b><span className="block text-ink-700">{tr('Read what they noticed and agreed, before you start.')}</span></span>
          <span className="shrink-0 font-semibold text-brand-700">{tr('Read')}</span>
        </button>
      )}

      {tab === 'summary' && b.assessment && (
        <Card title={tr('Teacher assessment')} subtitle={`${b.assessment.subject}${b.assessment.class_no ? `, Class ${b.assessment.class_no}` : ''}: ${b.assessment.chapter} · ${fmtDay(b.assessment.date)}`}>
          <p className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-700">
            <span>{tr('Overall')}{' '}<b>{b.assessment.scores?.overall ?? '-'}</b></span><span>{tr('Topic knowledge')}{' '}<b>{b.assessment.scores?.knowledge ?? '-'}</b></span><span>{tr('Teaching method')}{' '}<b>{b.assessment.scores?.teaching ?? '-'}</b></span>
            {b.assessment.reliability === 'low' && <span className="text-amber-700">{tr('Few answers: treat as a rough guide.')}</span>}
          </p>
          <p className={head}>{tr('To check during the visit')}</p>
          <List items={point(b.assessment.focus, 5)} empty={tr('No focus points.')} />
        </Card>
      )}

      {tab === 'summary' && <div data-tour="v-brief" className="grid gap-4 md:grid-cols-3">
        {columns.map(([title, items, tint]) => (
          <div key={title} className={`rounded-3xl p-5 ring-1 ring-brand-100 ${tint}`}>
            <h3 className="mb-2 font-serif text-lg font-semibold text-ink-900">{tr(title)}</h3>
            <List items={items} empty={tr('Nothing special.')} />
          </div>
        ))}
      </div>}

      <div className="grid gap-5">
        {tab === 'history' && <Card tour="v-history" title={scope ? tr('Earlier records: {scope}', { scope }) : tr('From earlier visits')} subtitle={scope ? tr('Only what is on record for {forWho} in this subject.', { forWho }) : undefined}>
          {scope && !hasForSubject && (
            <div className="mb-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <b>{tr('Nothing on record for {forWho} in {scope}.', { forWho, scope })}</b>{' '}{tr('Records about other subjects are hidden.')}{' '}<button onClick={() => setAllSubjects(true)} className="ms-2 font-semibold underline">{tr('Show all subjects')}</button>
            </div>
          )}
          {allSubjects && pick.subject && <button onClick={() => setAllSubjects(false)} className="mb-3 text-sm font-semibold text-brand-700 underline">{tr('Show only {what}', { what: `${tr(pick.subject)}${pick.class_no ? tr(', Class {class_no}', { class_no: pick.class_no }) : ''}` })}</button>}
          {nothingBefore && !(scope && !hasForSubject) ? <p className="text-sm text-ink-400">{tr('Nothing on record yet.')}</p> : (
            <div className="space-y-4">
              {earlier.open.length > 0 && <div><p className={head}>{tr('Still to improve')}</p>
                <List items={earlier.open.map((o) => <span key={o.ref}>{issueName(o)} <span className="text-xs text-ink-400">{tr('since {fmtDay}', { fmtDay: fmtDay(o.since) })}</span></span>)} /></div>}
              {earlier.actions.length > 0 && <div><p className={head}>{tr('We agreed to')}{scope ? tr(' (not tied to one subject)') : ''}</p>
                <List items={earlier.actions.map((a, i) => <span key={i}>{tr(a.action)} <span className={a.overdue_days ? 'text-xs font-semibold text-red-600' : 'text-xs text-ink-400'}>{a.overdue_days ? tr('{overdue_days} days late', { overdue_days: a.overdue_days }) : tr('by {fmtDay}', { fmtDay: fmtDay(a.due) })}</span></span>)} /></div>}
              {earlier.good.length > 0 && <div><p className={head}>{tr('Going well')}</p><List items={earlier.good.map((s) => s.point)} /></div>}
              {earlier.last.length > 0 && <div><p className={head}>{tr('Last time')}</p>
                <List items={earlier.last.flatMap((p) => sentences(p.overall, 2).map((x) => `${fmtDay(p.date)}: ${x}`))} /></div>}
            </div>
          )}
        </Card>}
        {tab === 'results' && <Card title={scope ? tr('Latest test results: {scope}', { scope }) : tr('Latest test results')} subtitle={tr('Students who need extra help')}>
          {!results.length ? <p className="text-sm text-ink-400">{scope ? tr('No test results on record for {scope}.', { scope }) : tr('No results on record.')}</p> : (
            <ul className="space-y-2.5 text-sm">{results.slice(0, 6).map((r, i) => (
              <li key={i}>
                <div className="flex justify-between"><span>{tr('Class {cls} · {subject}', { cls: r.cls, subject: r.subject })}</span><span className={`font-semibold ${r.below_pct >= 40 ? 'text-red-600' : r.below_pct >= 25 ? 'text-amber-700' : 'text-emerald-700'}`}>{tr('{below_pct} in 100 need help', { below_pct: r.below_pct })}</span></div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-brand-100"><div className={`h-full rounded-full ${r.below_pct >= 40 ? 'bg-red-500' : r.below_pct >= 25 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, r.below_pct)}%` }} /></div>
              </li>))}
            </ul>
          )}
          {b.pending_requests.length > 0 && <div className="mt-4"><p className={head}>{tr('Waiting from the teacher')}</p><List items={b.pending_requests.map((r) => r.title)} /></div>}
        </Card>}
      </div>

      {tab === 'history' && lastVisits.length > 0 && (
        <Card tour="v-earlier" title={tr('What earlier visitors noticed')} subtitle={tr('Written down by the CRPs who visited {forWho} before. Read this first if you are new here.', { forWho })}>
          <ul className="space-y-4">{lastVisits.slice(0, 3).map((p, i) => (
            <li key={i} className="rounded-2xl bg-brand-50/50 p-4 text-sm ring-1 ring-brand-100">
              <p className="flex flex-wrap items-baseline gap-x-2"><b className="text-ink-900">{fmtDay(p.date)}</b><span className="text-ink-700">{p.mentor ? (me && p.mentor.includes(me) ? tr('Visited by you') : tr('Visited by {mentor}', { mentor: p.mentor })) : tr('Visit on record')}</span>
                <span className="text-xs text-ink-500">{[p.cls ? tr('Class {cls}', { cls: p.cls }) : null, p.subject, p.topic].filter(Boolean).join(' · ')}</span></p>
              {p.overall && <p dir="auto" className="mt-1 text-ink-700">{sentences(p.overall, 2).join(' ')}</p>}
              {(p.strengths ?? []).length > 0 && <div className="mt-2"><p className={head}>{tr('Went well')}</p><List items={p.strengths ?? []} /></div>}
              {(p.growth ?? []).length > 0 && <div className="mt-2"><p className={head}>{tr('To improve')}</p><List items={(p.growth ?? []).map((g) => `${g.area}${g.try_this ? `: ${sentences(g.try_this, 1)[0]}` : ''}`)} /></div>}
              {(p.reasons ?? []).length > 0 && <div className="mt-2"><p className={head}>{tr('Why students found it hard')}</p><List items={(p.reasons ?? []).map((g) => `${g.issue}${g.teacher_action ? `. Teacher can: ${g.teacher_action}` : ''}`)} /></div>}
              {p.next_steps.length > 0 && <div className="mt-2"><p className={head}>{tr('Agreed next steps')}</p><List items={p.next_steps} /></div>}
              {p.notes && <div className="mt-2"><p className={head}>{tr('Notes of the CRP')}</p><p dir="auto" className="whitespace-pre-wrap text-ink-700">{tr(p.notes)}</p></div>}
            </li>))}</ul>
        </Card>
      )}

      {tab === 'history' && (b.school_history ?? []).length > 0 && (
        <Card title={tr('Visits to this school')} subtitle={tr('Kept for the school, whoever visits next.')}>
          <ul className="divide-y divide-brand-50 text-sm">{(b.school_history ?? []).slice(0, 6).map((h, i) => (
            <li key={i} className="py-2">
              <p className="flex flex-wrap items-baseline gap-x-2"><b className="text-ink-900">{fmtDay(h.date)}</b>
                <span className="text-ink-700">{h.mentor ? tr('Visited by {mentor}', { mentor: h.mentor }) : tr('Visit on record')}</span>
                <span className="text-xs text-ink-500">{[h.teacher, h.cls ? tr('Class {cls}', { cls: h.cls }) : null, h.subject].filter(Boolean).join(' · ')}</span></p>
              {h.overall && <p dir="auto" className="mt-0.5 text-xs text-ink-500">{tr(sentences(h.overall, 1)[0])}</p>}
            </li>))}</ul>
        </Card>
      )}

      {tab === 'books' && <details open className="rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100">
        <summary className="cursor-pointer font-serif text-lg font-semibold text-ink-900">{tr('Textbook for this class (optional)')}</summary>
        <div className="mt-3"><TextbookPanel teacherId={b.teacher?.id} schoolId={b.school.id} defaults={{ class_no: pick.class_no ? Number(pick.class_no) : b.teacher?.classes[0], subject: pick.subject || b.teacher?.subjects[0], board: b.school.board, language: b.school.medium }} /></div>
      </details>}
      {dir === null && <Spinner />}
    </div>
  );
}

type PendingMedia = { id: string; kind: string; question_index: number | null; student_label: string | null; name: string; url: string };

function MediaList({ items, waiting = [], onRemove }: { items: Session['media']; waiting?: PendingMedia[]; onRemove: (id: string) => void }) {
  const { tr } = useLang();
  if (!items.length && !waiting.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((m) => {
        const student = m.kind === 'student_answer';
        const heard = !!m.transcript; const failed = !heard && !!m.transcript_by;
        const said = (m.transcript ?? '').replace(/^\[\d\d:\d\d\]\s*/gm, '').replace(/\n+/g, ' ').trim();
        return (
          <li key={m.id} className="rounded-2xl bg-brand-50/50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              {m.kind === 'crp_notes_file' ? <FileText size={15} className="shrink-0 text-brand-600" /> : <FileAudio size={15} className="shrink-0 text-brand-600" />}
              <span className="min-w-0 flex-1 truncate font-semibold">{m.student_label ?? m.name}</span>
              {student && (heard ? <Badge tone="good">{tr('Heard')}</Badge> : failed ? <Badge tone="warn">{tr('Not heard')}</Badge> : <Badge tone="brand">{tr('Listening…')}</Badge>)}
              {m.kind === 'crp_notes_file' && m.file_id && <ExtLink href={api.rawUrl(m.file_id)} className="shrink-0 text-xs font-semibold text-brand-700 underline">{tr('Open')}</ExtLink>}
              {m.duration ? <span className="text-xs text-ink-400">{tr('{x} s', { x: Math.round(m.duration) })}</span> : null}
              {m.file_id && m.kind !== 'crp_notes_file' && <audio controls preload="none" src={api.rawUrl(m.file_id)} className="order-last h-8 w-full sm:order-none sm:w-auto sm:max-w-[180px]" />}
              <button onClick={() => onRemove(m.id)} className="rounded-full p-1 text-ink-400 hover:text-red-600" aria-label={tr('Remove {name}', { name: m.student_label ?? tr('recording') })}><Trash2 size={14} /></button>
            </div>
            {heard ? (student ? <p dir="auto" className="mt-2 text-sm text-ink-700">&ldquo;{tr(said)}&rdquo;</p> : <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{tr(m.transcript)}</p>)
              : failed ? <p className="mt-2 text-xs text-amber-700">{student ? tr('We could not hear this answer. Please record it again (closer to the microphone), then remove this one.') : tr('We could not turn this recording into text. Your notes can still be used.')}</p>
              : m.kind !== 'crp_notes_file' ? <p className="mt-2 flex items-center gap-1 text-xs text-ink-400"><Loader2 size={12} className="animate-spin" />{tr('Turning speech into text…')}</p> : null}
          </li>
        );
      })}
      {waiting.map((m) => (
        <li key={m.id} className="rounded-2xl bg-brand-50/50 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            {m.kind === 'crp_notes_file' ? <FileText size={15} className="shrink-0 text-brand-600" /> : <FileAudio size={15} className="shrink-0 text-brand-600" />}
            <span className="min-w-0 flex-1 truncate font-semibold">{m.student_label ?? m.name}</span>
            {m.kind !== 'crp_notes_file' && <audio controls preload="auto" src={m.url} className="order-last h-8 w-full sm:order-none sm:w-auto sm:max-w-[180px]" />}
            <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400"><Loader2 size={12} className="animate-spin" />{tr('Saving…')}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One student answer: what the AI said, and the mentor's own check. The mentor's word counts; the AI's verdict stays on record. */
const MENTOR_CHOICES: { v: 'agree' | 'correct' | 'partly' | 'wrong'; label: string; on: string }[] = [
  { v: 'agree', label: 'Agree', on: 'bg-brand-600 text-white ring-brand-600' }, { v: 'correct', label: 'Correct', on: 'bg-emerald-600 text-white ring-emerald-600' },
  { v: 'partly', label: 'Partly', on: 'bg-amber-500 text-white ring-amber-500' }, { v: 'wrong', label: 'Not correct', on: 'bg-red-600 text-white ring-red-600' },
];
function AnswerCheck({ q, index, sid, onChanged, setError }: { q: NonNullable<Evaluation['students']>['per_question'][number]; index: number; sid: string; onChanged: () => void; setError: (e: string) => void }) {
  const { tr } = useLang();
  const m = q.mentor;
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(m?.reason ?? '');
  useEffect(() => { setReason(m?.reason ?? ''); }, [m?.reason, m?.verdict]);
  const send = async (verdict: 'agree' | 'correct' | 'partly' | 'wrong' | null, why?: string) => {
    setBusy(true);
    try { await api.visits.reviewAnswer(sid, index, { verdict, reason: verdict && verdict !== 'agree' ? (why ?? reason) || null : null }); onChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <li className="rounded-2xl bg-brand-50/50 p-2.5">
      <p className="font-semibold text-ink-900">{tr(q.question)}</p>
      <p className="text-ink-700"><span className="text-xs font-semibold text-ink-500">{tr('AI said:')}{' '}</span>{tr(q.verdict)}{q.note ? <span className="text-xs text-ink-500"> · {tr(sentences(q.note, 1)[0])}</span> : null}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label={tr('Your check of this answer')}>
        <span className="me-1 text-xs font-semibold text-ink-500">{tr('Your check:')}</span>
        {MENTOR_CHOICES.map((c) => (
          <button key={c.v} type="button" disabled={busy} aria-pressed={m?.verdict === c.v} onClick={() => send(c.v)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 transition disabled:opacity-50 ${m?.verdict === c.v ? c.on : 'bg-surface text-brand-700 ring-brand-100 hover:bg-brand-50'}`}>{tr(c.label)}</button>))}
        {m && <button type="button" disabled={busy} onClick={() => send(null)} className="px-2 py-1 text-xs font-semibold text-ink-500 underline">{tr('Use the AI\'s')}</button>}
      </div>
      {m && m.verdict !== 'agree' && (
        <Input aria-label={tr('Why do you think so? (optional)')} className="mt-2" placeholder={tr('Why? (optional)')} value={reason} maxLength={300} disabled={busy}
          onChange={(e) => setReason(e.target.value)} onBlur={() => { if (reason.trim() !== (m.reason ?? '')) send(m.verdict, reason); }} />)}
      {m && <p className="mt-1.5 text-xs text-ink-500">{m.verdict === 'agree' ? tr('Checked by {who}. The AI\'s answer is kept on record.', { who: m.by ?? tr('the mentor') }) : tr('Changed by {who} to "{choice}". The AI\'s answer is kept on record.', { who: m.by ?? tr('the mentor'), choice: tr(MENTOR_CHOICES.find((c) => c.v === m.verdict)?.label ?? '') })}</p>}
    </li>
  );
}

function Results({ s, evaluating, onEvaluate, onSaved, onPatch, setError }: {
  s: Session; evaluating: boolean; onEvaluate: () => void; onSaved: () => void; onPatch: (b: Record<string, unknown>) => void; setError: (e: string) => void;
}) {
  const { tr } = useLang();
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

  if (evaluating) return <Card tour="res-wait"><Spinner label={tr('Working out the results (recordings are turned into text first). This can take a minute…')} /></Card>;
  if (r.error || s.job?.status === 'failed') return <Card><ErrorNote error="The results could not be made this time." /><div className="mt-3"><Button onClick={onEvaluate}>{tr('Try again')}</Button></div></Card>;
  if (!r.overall) return <Card tour="res-empty"><Empty>{tr('No results yet.')}</Empty><div className="mt-3 flex justify-center"><Button onClick={onEvaluate}>{tr('Get the results')}</Button></div></Card>;

  const n = Math.round(Number(days));
  const daysOk = Number.isFinite(n) && n >= 1 && n <= 365;
  const due = new Date(); due.setDate(due.getDate() + (daysOk ? n : 14));
  const locked = s.status === 'saved';
  const setFollow = (v: string) => { setDays(v); const k = Math.round(Number(v)); if (k >= 1 && k <= 365 && !locked) onPatch({ followup_days: k }); };
  const doSave = async () => {
    if (!daysOk) { setError(tr('Choose how many days (1 to 365) before you follow up.')); return; }
    setBusy(true);
    try { const x = await api.visits.save(s.id, { growth: [...growth], next_steps: [...steps] }); setSaved(tr('Saved to your records: {observations} observation(s) and {actions} follow-up(s).', { observations: x.observations, actions: x.actions })); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      {r.safety_flag && <ErrorNote error={tr('Please look at this first: {safety_flag}', { safety_flag: r.safety_flag })} />}
      <Card tour="res-short" title={tr('In short')} action={r.confidence === 'low' ? <Badge tone="warn">{tr('Based on little information')}</Badge> : undefined}>
        <List items={sentences(r.overall, 5)} />
        {r.confidence === 'low' && <p className="mt-3 text-xs text-ink-500">{tr('Add a lesson recording or your notes in the earlier steps to get a fuller picture.')}</p>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card tour="res-well" title={tr('What went well')}>
          {!(r.strengths ?? []).length ? <p className="text-sm text-ink-400">{tr('Nothing recorded.')}</p> : (
            <ul className="space-y-2.5">{(r.strengths ?? []).map((x) => (
              <li key={x.point} className="flex gap-2 text-sm"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" />
                <span><b className="text-ink-900">{tr(x.point)}</b>{x.evidence && <span className="block text-xs text-ink-500">{tr('Seen: {x}', { x: sentences(x.evidence, 1)[0] })}</span>}</span></li>))}</ul>
          )}
        </Card>
        <Card tour="res-improve" title={tr('What to improve')} subtitle={locked ? undefined : tr('Tick the ones to keep track of.')}>
          {!(r.growth ?? []).length ? <p className="text-sm text-ink-400">{tr('Nothing big. Keep it up.')}</p> : (
            <ul className="space-y-4">{(r.growth ?? []).map((g, i) => (
              <li key={i} className="flex gap-3">
                <input type="checkbox" checked={growth.has(i)} disabled={locked} onChange={() => toggle(growth, i, setGrowth)} className="mt-1 h-4 w-4 accent-[rgb(var(--b600))]" aria-label={tr(g.area)} />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-ink-900">{tr(g.area)} <Badge tone={SEVERITY[g.severity]?.tone ?? 'neutral'}>{SEVERITY[g.severity]?.label ?? g.severity}</Badge></p>
                  <ul className="mt-1 space-y-0.5 text-ink-700">
                    <li>• <span className="text-ink-500">{tr('Seen:')}</span> {tr(sentences(g.evidence, 1)[0])}</li>
                    <li>• <span className="font-semibold text-brand-800">{tr('Try:')}</span> {tr(sentences(g.try_this, 1)[0])}</li>
                  </ul>
                </div>
              </li>))}</ul>
          )}
        </Card>
        <Card title={tr('How the students did')}>
          <List items={sentences(r.students?.summary, 3)} empty={tr('No student answers were recorded.')} />
          {(r.students?.per_question ?? []).length > 0 && (() => {
            const all = r.students?.per_question ?? []; const done = all.filter((q) => q.mentor).length; const changed = all.filter((q) => q.mentor && q.mentor.verdict !== 'agree').length;
            return <p className="mt-3 text-xs text-ink-500">{tr('You can check each answer below. Your check counts, and the AI\'s answer is kept.')}{' '}{done > 0 ? (changed ? tr('You checked {done} of {all}, changed {changed}.', { done, all: all.length, changed }) : tr('You checked {done} of {all}.', { done, all: all.length })) : ''}</p>;
          })()}
          {(r.students?.per_question ?? []).length > 0 && (
            <ul className="mt-3 space-y-2 text-sm">{(r.students?.per_question ?? []).map((q, i) => (
              <AnswerCheck key={i} q={q} index={i} sid={s.id} onChanged={onSaved} setError={setError} />))}</ul>
          )}
          {(r.students?.misconceptions ?? []).length > 0 && <div className="mt-3"><p className={head}>{tr('Ideas students mixed up')}</p><List items={r.students!.misconceptions} /></div>}
          {(r.students?.reasons ?? []).length > 0 && (
            <div className="mt-4 rounded-2xl bg-amber-50/70 p-4 ring-1 ring-amber-100" data-tour="res-reasons">
              <p className={head}>{tr('Why the students found it hard, and what to change')}</p>
              <ul className="space-y-3 text-sm">{(r.students?.reasons ?? []).map((x, i) => (
                <li key={i}><p className="font-semibold text-ink-900">{tr(x.issue)}</p>
                  <p className="text-ink-700"><span className="text-ink-500">{tr('Heard:')}</span> {tr(x.evidence)}</p>
                  <p className="text-ink-700"><span className="text-ink-500">{tr('Likely reason:')}</span> {tr(x.likely_reason)}</p>
                  <p className="text-ink-900"><span className="font-semibold text-brand-800">{tr('The teacher can:')}</span> {tr(x.teacher_action)}</p></li>))}</ul>
            </div>
          )}
        </Card>
        <Card title={tr('Compared with last visit')}>
          {!(r.compared_with_before ?? []).length ? <p className="text-sm text-ink-400">{tr('Nothing to compare yet.')}</p> : (
            <ul className="space-y-2.5">{(r.compared_with_before ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm"><Badge tone={CHANGE[c.change]?.tone ?? 'neutral'}>{CHANGE[c.change]?.label ?? c.change}</Badge>
                <span className="text-ink-900">{issueName({ issue: c.issue })}</span></li>))}</ul>
          )}
        </Card>
      </div>

      {rubric.length > 0 && (
        <Card title={tr('Teaching practices')} subtitle={tr('1 is the lowest, 5 is the best. Left out if not seen.')}>
          <ul className="grid gap-2 sm:grid-cols-2">{rubric.map((x) => (
            <li key={x.element} className="flex items-center justify-between gap-3 rounded-2xl bg-brand-50/50 px-3 py-2 text-sm">
              <span className="text-ink-900">{tr(PRACTICE[x.element] ?? x.element)}</span>
              <span className="shrink-0 text-right"><b className="text-lg text-brand-800">{x.score}</b><span className="text-xs text-ink-500"> / 5 · {tr(SCORE_WORD[x.score ?? 0] ?? '')}</span></span></li>))}</ul>
        </Card>
      )}

      <Card tour="res-steps" title={tr('Agreed next steps')} subtitle={locked ? undefined : tr('Tick the steps you agreed with the teacher.')}>
        <ul className="space-y-2">{(r.next_steps ?? []).map((st, i) => (
          <li key={i} className="flex items-start gap-3 text-sm"><input type="checkbox" checked={steps.has(i)} disabled={locked} onChange={() => toggle(steps, i, setSteps)} className="mt-1 h-4 w-4 accent-[rgb(var(--b600))]" aria-label={tr(st.action)} />
            <span className="flex-1">{tr(st.action)}{st.who ? <span className="text-ink-500"> ({tr(st.who)})</span> : null}</span></li>))}</ul>

        <div data-tour="res-followup" className="mt-5 rounded-2xl bg-brand-50/60 p-4">
          <p className="text-sm font-semibold text-ink-900">{tr('When will you follow up with the teacher?')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {[7, 14, 21, 30].map((d) => (
              <button key={d} type="button" disabled={locked} onClick={() => setFollow(String(d))}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition disabled:opacity-60 ${Number(days) === d ? 'bg-brand-600 text-white ring-brand-600' : 'bg-surface text-ink-700 ring-brand-100 hover:ring-brand-300'}`}>{tr('{d} days', { d })}</button>))}
            <span className="flex items-center gap-1.5 text-sm text-ink-500">{tr('or')}{' '}<Input type="number" min={1} max={365} disabled={locked} value={days} onChange={(e) => setFollow(e.target.value)} className="!w-20 text-center" aria-label={tr('Number of days')} />{' '}{tr('days')}</span>
          </div>
          <p className="mt-2 text-xs text-ink-500">{daysOk ? <>{tr('Follow up by')}{' '}<b className="text-ink-700">{fmtDay(due)}</b>{tr('. The usual choice is 14 days.')}</> : tr('Enter a number of days from 1 to 365.')}</p>
        </div>

        <div data-tour="res-save" className="mt-4 flex flex-wrap items-center gap-3">
          {locked ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />{tr('Saved to your records')}</span>
            : <><Button onClick={doSave} busy={busy} disabled={!daysOk}>{tr('Save to records')}</Button><Button variant="soft" onClick={onEvaluate}>{tr('Redo the results')}</Button></>}
          {saved && <span className="text-sm text-ink-700">{tr(saved)}</span>}
        </div>
      </Card>

      <TeacherReportCard s={s} setError={setError} onSent={onSaved} />
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><VisitPage /></Suspense>;
}
