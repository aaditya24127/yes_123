'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, FileAudio, Loader2, Mic, Sparkles, Trash2 } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import TextbookPanel from '@/components/TextbookPanel';
import AudioRecorder from '@/components/ui/AudioRecorder';
import { Badge, Button, Card, Empty, ErrorNote, Field, Input, List, Note, Select, Spinner, Stepper, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useDirectory, useLoad, usePoll } from '@/lib/hooks';
import type { Brief, Evaluation, Session } from '@/lib/types';
import { BAND } from '@/lib/theme';

const STEPS = ['Before class', 'In class', 'Students', 'Results'];
const CHANGE: Record<string, { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }> = {
  improved: { label: 'Improved', tone: 'good' }, same: { label: 'Same', tone: 'warn' }, worse: { label: 'Worse', tone: 'bad' }, not_seen: { label: 'Not seen', tone: 'neutral' },
};

function VisitPage() {
  const params = useSearchParams(); const router = useRouter();
  const dir = useDirectory();
  const [pick, setPick] = useState({ school_id: '', teacher_id: '', class_no: '', subject: '', topic: '' });
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
  const loadBrief = () => run('brief', async () => { setBrief(await api.visits.brief(pick.teacher_id ? { teacher_id: pick.teacher_id } : { school_id: pick.school_id })); setStep(0); });
  const start = () => run('start', async () => {
    const s = await api.visits.start({ school_id: pick.school_id || brief?.school.id, teacher_id: pick.teacher_id || undefined, class_no: pick.class_no ? Number(pick.class_no) : null,
      subject: pick.subject || undefined, topic: pick.topic || undefined });
    setSession(s); setStep(1); router.replace(`/visit?session=${s.id}`); recent.reload();
  });
  const save = (body: Record<string, unknown>) => session && api.visits.edit(session.id, body).then(setSession).catch((e) => setError(e.message));
  const addAudio = (kind: string, extra: { question_index?: number; student_label?: string } = {}) => (blob: Blob, name: string) =>
    session && run(kind + (extra.question_index ?? ''), async () => setSession(await api.visits.addMedia(session.id, blob, kind, extra, name)));

  return (
    <PageShell title="School visit" subtitle="Four steps: see the history before class, record the lesson and your notes, ask students a few questions, then get the evaluation and save it.">
      <ErrorNote error={error} onClose={() => setError('')} />
      {!session && (
        <Card title="Who are you visiting?">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="School"><Select value={pick.school_id} onChange={(e) => { setPick({ ...pick, school_id: e.target.value, teacher_id: '' }); setBrief(null); }}>
              <option value="">Choose…</option>{dir?.schools.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name}</option>)}</Select></Field>
            <Field label="Teacher"><Select value={pick.teacher_id} disabled={!pick.school_id} onChange={(e) => {
              const t = dir?.teachers.find((x) => x.id === e.target.value);
              setPick({ ...pick, teacher_id: e.target.value, class_no: t?.classes_taught[0] ? String(t.classes_taught[0]) : '', subject: t?.subjects_taught[0] ?? '' }); setBrief(null);
            }}><option value="">Whole school</option>{dir?.teachers.filter((t) => t.school_id === pick.school_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
            <Field label="Class"><Select value={pick.class_no} onChange={(e) => setPick({ ...pick, class_no: e.target.value })}>
              <option value="">–</option>{(teacher?.classes_taught.length ? teacher.classes_taught : Array.from({ length: 10 }, (_, i) => i + 1)).map((c) => <option key={c} value={c}>Class {c}</option>)}</Select></Field>
            <Field label="Subject"><Select value={pick.subject} onChange={(e) => setPick({ ...pick, subject: e.target.value })}>
              <option value="">–</option>{(teacher?.subjects_taught.length ? teacher.subjects_taught : ['Marathi', 'English', 'Hindi', 'Mathematics', 'EVS', 'Science', 'Social Science']).map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Today's topic (optional)"><Input value={pick.topic} onChange={(e) => setPick({ ...pick, topic: e.target.value })} placeholder="e.g. place value" /></Field>
          </div>
          <div className="mt-4 flex gap-2"><Button onClick={loadBrief} busy={busy === 'brief'} disabled={!pick.school_id}>Show what I need to know</Button></div>
        </Card>
      )}

      {(brief || session) && (
        <div className="flex flex-wrap items-center gap-3">
          <Stepper steps={STEPS} current={session ? step : 0} maxReached={session ? Math.max(step, session.stage - 1) : 0} onPick={session ? setStep : undefined} />
          {session && <Button variant="ghost" className="ms-auto" onClick={() => { setSession(null); setBrief(null); setStep(0); router.replace('/visit'); }}>Start another visit</Button>}
        </div>
      )}

      {brief && step === 0 && <BriefView b={brief} onStart={session ? undefined : start} busy={busy === 'start'} cls={pick.class_no} subject={pick.subject} />}

      {session && step === 1 && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="Record the lesson" subtitle="Record on this phone or laptop, or upload a recording. It is turned into text automatically.">
            <AudioRecorder onDone={addAudio('lesson_audio')!} busy={busy === 'lesson_audio'} label="Record lesson" />
            <MediaList items={session.media.filter((m) => m.kind === 'lesson_audio')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <Card title="Your notes">
            <Field label="What you observed"><TextArea defaultValue={session.crp_notes ?? ''} onBlur={(e) => save({ crp_notes: e.target.value })} rows={6}
              placeholder="Who answered questions, how the teacher checked understanding, use of materials, time on task…" /></Field>
            <Field label="What changed since the last visit" className="mt-3"><TextArea defaultValue={session.changes_since_last ?? ''} onBlur={(e) => save({ changes_since_last: e.target.value })}
              placeholder="e.g. reading corner now in use; group work started" /></Field>
            <div className="mt-3"><label className="cursor-pointer text-sm font-semibold text-brand-700 underline">Add a photo of written notes
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addAudio('crp_notes_file')!(f, f.name); e.target.value = ''; }} /></label></div>
            <MediaList items={session.media.filter((m) => m.kind === 'crp_notes_file')} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
          </Card>
          <div className="lg:col-span-2 flex justify-end"><Button onClick={() => { save({ stage: Math.max(3, session.stage) }); setStep(2); }}>Next: students</Button></div>
        </div>
      )}

      {session && step === 2 && (
        <>
          <Card title="Questions for students" subtitle="Ask 4–5 students (front, middle and back rows; girls and boys). Record each answer; names are not stored."
            action={<Button variant="soft" icon={<Sparkles size={16} />} busy={busy === 'q'} onClick={() => run('q', async () => setSession(await api.visits.questions(session.id)))}>
              {session.questions.length ? 'Suggest again' : 'Suggest questions'}</Button>}>
            {session.question_tips?.length ? <div className="mb-3"><Note><List items={session.question_tips} /></Note></div> : null}
            {!session.questions.length ? <Empty>Press “Suggest questions”. They are based on today&apos;s topic, the lesson recording and the textbook.</Empty> : (
              <ol className="space-y-4">
                {session.questions.map((q, i) => {
                  const answers = session.media.filter((m) => m.kind === 'student_answer' && m.question_index === i);
                  return (
                    <li key={i} className="rounded-2xl border border-brand-100 p-4">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{q.level}</Badge><span className="text-xs text-ink-400">Ask: {q.ask_who}</span></div>
                      <p className="mt-2 font-semibold text-ink-900">{i + 1}. {q.question}</p>
                      <p className="mt-1 text-sm text-ink-500"><b>Good answer:</b> {q.good_answer}</p>
                      <p className="text-sm text-ink-500"><b>Listen for:</b> {q.watch_for}</p>
                      <div className="mt-3"><AudioRecorder small label={`Record Student ${String.fromCharCode(65 + answers.length)}`} busy={busy === 'student_answer' + i}
                        onDone={addAudio('student_answer', { question_index: i, student_label: `Student ${String.fromCharCode(65 + answers.length)}` })!} /></div>
                      <MediaList items={answers} onRemove={(id) => run('rm', async () => setSession(await api.visits.removeMedia(session.id, id)))} />
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
          <div className="flex justify-end"><Button onClick={() => { setStep(3); if (!session.result?.overall && !evaluating) run('eval', async () => setSession(await api.visits.evaluate(session.id))); }}>Next: get results</Button></div>
        </>
      )}

      {session && step === 3 && <Results s={session} evaluating={evaluating || busy === 'eval'} onEvaluate={() => run('eval', async () => setSession(await api.visits.evaluate(session.id)))}
        onSaved={() => { reload(); recent.reload(); }} setError={setError} />}

      {!session && !brief && (
        <Card title="Recent visits">
          {!recent.data?.length ? <Empty>No visits yet.</Empty> : (
            <ul className="divide-y divide-brand-50">
              {recent.data.map((v) => (
                <li key={v.id}><button className="flex w-full items-center gap-3 py-2.5 text-start text-sm hover:text-brand-700" onClick={() => router.replace(`/visit?session=${v.id}`)}>
                  <span className="w-28 shrink-0 text-ink-500">{new Date(v.started_at).toLocaleDateString()}</span>
                  <span className="flex-1 truncate">{v.teacher_name ?? v.school_name}{v.class_no ? ` · Class ${v.class_no}` : ''}{v.subject ? ` ${v.subject}` : ''}{v.topic ? ` · ${v.topic}` : ''}</span>
                  <Badge tone={v.status === 'saved' ? 'good' : v.status === 'evaluated' ? 'brand' : 'neutral'}>{v.status === 'saved' ? 'Saved' : v.status === 'evaluated' ? 'Evaluated' : `Step ${v.stage}`}</Badge>
                </button></li>
              ))}
            </ul>
          )}
        </Card>
      )}
    </PageShell>
  );
}

function BriefView({ b, onStart, busy, cls, subject }: { b: Brief; onStart?: () => void; busy: boolean; cls: string; subject: string }) {
  const band = b.scores?.band ? BAND[b.scores.band] : null;
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2" title={b.who} subtitle={`${b.school.board} · ${b.school.medium} medium · Classes ${b.school.grades} · ${b.visit_count} visit(s) on record${b.last_visit ? `, last on ${b.last_visit}` : ''}`}
        action={b.scores?.score != null ? <span className={`rounded-full px-3 py-1 text-sm font-semibold ring-1 ${band?.chip ?? ''}`}>Priority {b.scores.score}{b.scores.rank ? ` · rank ${b.scores.rank}` : ''}</span> : undefined}>
        {b.alerts.map((a, i) => <div key={i} className="mb-2 flex items-center gap-2 rounded-2xl bg-red-50 px-3 py-2 text-sm text-red-700"><AlertTriangle size={15} />{a}</div>)}
        {b.brief && (
          <div className="space-y-3">
            <Note>{b.brief.summary}{b.brief_by && <span className="ms-1 text-xs opacity-60">({b.brief_by === 'rules' ? 'built-in summary' : b.brief_by})</span>}</Note>
            <div className="grid gap-4 md:grid-cols-3">
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Focus on</p><List items={b.brief.focus_points} /></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Ask the teacher</p><List items={b.brief.ask_teacher} /></div>
              <div><p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Watch in class</p><List items={b.brief.check_in_class} /></div>
            </div>
          </div>
        )}
        {onStart && <div className="mt-4"><Button onClick={onStart} busy={busy} icon={<Mic size={16} />}>Start the visit</Button></div>}
      </Card>
      <Card title="Earlier feedback">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-400">Open issues</p>
        <List items={b.open_issues.map((o) => <span key={o.ref}>{o.issue.replace(/^\[O\d+\] /, '')} <span className="text-xs text-ink-400">since {o.since}</span></span>)} empty="None open." />
        <p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-400">Agreed actions</p>
        <List items={b.open_actions.map((a, i) => <span key={i}>{a.action} <span className={a.overdue_days ? 'text-xs text-red-600' : 'text-xs text-ink-400'}>{a.overdue_days ? `${a.overdue_days} days overdue` : `due ${a.due}`}</span></span>)} empty="None open." />
        {b.strengths_seen.length > 0 && <><p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-400">Good practice seen</p><List items={b.strengths_seen.map((s) => s.point)} /></>}
        {b.previous_sessions.length > 0 && <><p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-400">Last evaluations</p>
          <List items={b.previous_sessions.map((p) => `${p.date}: ${p.overall ?? ''}`)} /></>}
      </Card>
      <Card title="Latest test results" className="lg:col-span-1">
        {!b.latest_results.length ? <p className="text-sm text-ink-400">No results on record.</p> : (
          <ul className="space-y-1.5 text-sm">{b.latest_results.map((r, i) => (
            <li key={i} className="flex items-center gap-2"><span className="w-20 shrink-0 text-ink-500">Class {r.cls}</span><span className="flex-1 truncate">{r.subject}</span>
              <span className={`font-semibold ${r.below_pct >= 40 ? 'text-red-600' : r.below_pct >= 25 ? 'text-amber-700' : 'text-emerald-700'}`}>{r.below_pct}% below</span></li>))}
          </ul>
        )}
        {b.pending_requests.length > 0 && <><p className="mb-1 mt-4 text-xs font-semibold uppercase tracking-wider text-ink-400">Waiting from teacher</p><List items={b.pending_requests.map((r) => `${r.title} (${r.status})`)} /></>}
      </Card>
      <div className="lg:col-span-2">
        <TextbookPanel teacherId={b.teacher?.id} schoolId={b.school.id} defaults={{ class_no: cls ? Number(cls) : b.teacher?.classes[0], subject: subject || b.teacher?.subjects[0], board: b.school.board, language: b.school.medium }} />
      </div>
    </div>
  );
}

function MediaList({ items, onRemove }: { items: Session['media']; onRemove: (id: string) => void }) {
  if (!items.length) return null;
  return (
    <ul className="mt-3 space-y-2">
      {items.map((m) => (
        <li key={m.id} className="rounded-2xl bg-brand-50/50 p-3 text-sm">
          <div className="flex items-center gap-2">
            <FileAudio size={15} className="shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1 truncate font-semibold">{m.student_label ?? m.name}</span>
            {m.duration ? <span className="text-xs text-ink-400">{Math.round(m.duration)} s</span> : null}
            {m.file_id && <audio controls preload="none" src={api.rawUrl(m.file_id)} className="h-8 max-w-[180px]" />}
            <button onClick={() => onRemove(m.id)} className="rounded-full p-1 text-ink-400 hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>
          </div>
          {m.transcript ? <p className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap text-xs text-ink-700">{m.transcript}</p>
            : m.transcript_by ? <p className="mt-2 text-xs text-amber-700">{m.transcript_by}</p>
            : m.kind !== 'crp_notes_file' ? <p className="mt-2 flex items-center gap-1 text-xs text-ink-400"><Loader2 size={12} className="animate-spin" />Turning speech into text…</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Results({ s, evaluating, onEvaluate, onSaved, setError }: { s: Session; evaluating: boolean; onEvaluate: () => void; onSaved: () => void; setError: (e: string) => void }) {
  const r = s.result as Partial<Evaluation>;
  const [growth, setGrowth] = useState<Set<number>>(new Set());
  const [steps, setSteps] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setGrowth(new Set((r.growth ?? []).map((_, i) => i))); setSteps(new Set((r.next_steps ?? []).map((_, i) => i))); }, [r.growth, r.next_steps]);
  const toggle = (set: Set<number>, i: number, fn: (x: Set<number>) => void) => { const n = new Set(set); n.has(i) ? n.delete(i) : n.add(i); fn(n); };
  const rubric = useMemo(() => (r.rubric ?? []).filter((x) => x.score != null || x.evidence), [r.rubric]);

  if (evaluating) return <Card><Spinner label="Evaluating the lesson (transcribing recordings first if needed). This can take a minute…" /></Card>;
  if (r.error || s.job?.status === 'failed') return <Card><ErrorNote error={`Evaluation did not finish: ${r.error ?? s.job?.error ?? ''}`} /><div className="mt-3"><Button onClick={onEvaluate}>Try again</Button></div></Card>;
  if (!r.overall) return <Card><Empty>No evaluation yet.</Empty><div className="mt-3 flex justify-center"><Button onClick={onEvaluate}>Evaluate now</Button></div></Card>;

  const doSave = async () => {
    setBusy(true);
    try { const x = await api.visits.save(s.id, { growth: [...growth], next_steps: [...steps] }); setSaved(`Saved: ${x.observations} observation(s), ${x.actions} agreed action(s), ${x.resolved} earlier issue(s) marked improved. The priority list now includes this visit.`); onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-5">
      {r.safety_flag && <ErrorNote error={`Safety concern: ${r.safety_flag}`} />}
      <Card title="Overall" action={<Badge tone={r.confidence === 'high' ? 'good' : r.confidence === 'medium' ? 'brand' : 'warn'}>{r.confidence} confidence</Badge>}
        subtitle={`${r.confidence_reason ?? ''}${r.evaluated_by ? ` · evaluated by ${r.evaluated_by === 'rules' ? 'built-in rules (switch on an AI for a full evaluation)' : r.evaluated_by}` : ''}`}>
        <p className="text-[15px] leading-relaxed text-ink-900">{r.overall}</p>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="What went well"><List items={(r.strengths ?? []).map((x) => <span key={x.point}><b>{x.point}</b> <span className="text-ink-500">— {x.evidence}</span></span>)} empty="Nothing recorded." /></Card>
        <Card title="Areas to grow" subtitle="Ticked items are saved as open issues for follow-up.">
          {!(r.growth ?? []).length ? <p className="text-sm text-ink-400">None.</p> : (
            <ul className="space-y-3">{(r.growth ?? []).map((g, i) => (
              <li key={i} className="flex gap-3">
                <input type="checkbox" checked={growth.has(i)} disabled={s.status === 'saved'} onChange={() => toggle(growth, i, setGrowth)} className="mt-1 h-4 w-4 accent-[rgb(var(--b600))]" />
                <div className="text-sm"><p className="font-semibold text-ink-900">{g.area} <Badge tone={g.severity === 'critical' ? 'bad' : g.severity === 'significant' ? 'warn' : 'neutral'}>{g.severity}</Badge></p>
                  <p className="text-ink-500">Seen: {g.evidence}</p><p className="text-ink-700">Why it matters: {g.why} <span className="text-xs text-ink-400">[{g.source}]</span></p>
                  <p className="text-brand-800">Try: {g.try_this}</p></div>
              </li>))}</ul>
          )}
        </Card>
        <Card title="What students showed">
          <p className="text-sm text-ink-700">{r.students?.summary}</p>
          <ul className="mt-2 space-y-1.5 text-sm">{(r.students?.per_question ?? []).map((q, i) => <li key={i}><b>{q.question}</b> — {q.verdict}. <span className="text-ink-500">{q.note}</span></li>)}</ul>
          {(r.students?.misconceptions ?? []).length > 0 && <><p className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-ink-400">Misconceptions heard</p><List items={r.students!.misconceptions} /></>}
        </Card>
        <Card title="Compared with earlier visits">
          {!(r.compared_with_before ?? []).length ? <p className="text-sm text-ink-400">No earlier issues to compare.</p> : (
            <ul className="space-y-2">{(r.compared_with_before ?? []).map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-sm"><Badge tone={CHANGE[c.change]?.tone ?? 'neutral'}>{CHANGE[c.change]?.label ?? c.change}</Badge>
                <span><span className="text-ink-900">{c.issue.replace(/^\[O\d+\] /, '')}</span> <span className="text-ink-500">— {c.evidence}</span></span></li>))}</ul>
          )}
        </Card>
      </div>
      {rubric.length > 0 && (
        <Card title="Teaching practices (1–5)" subtitle="Based on the World Bank Teach framework; blank means not observed.">
          <ul className="grid gap-2 sm:grid-cols-2">{rubric.map((x) => (
            <li key={x.element} className="rounded-2xl bg-brand-50/50 p-3 text-sm"><div className="flex items-center justify-between"><b>{x.element}</b><span className="text-lg font-semibold text-brand-800">{x.score ?? '–'}</span></div>
              <p className="mt-1 text-xs text-ink-500">{x.evidence}</p></li>))}</ul>
        </Card>
      )}
      <Card title="Agreed next steps" subtitle="Ticked steps become follow-ups with a due date; they count in the priority list when overdue.">
        <ul className="space-y-2">{(r.next_steps ?? []).map((n, i) => (
          <li key={i} className="flex items-center gap-3 text-sm"><input type="checkbox" checked={steps.has(i)} disabled={s.status === 'saved'} onChange={() => toggle(steps, i, setSteps)} className="h-4 w-4 accent-[rgb(var(--b600))]" />
            <span className="flex-1">{n.action} <span className="text-ink-500">({n.who}, in {n.due_in_days} days)</span></span></li>))}</ul>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {s.status === 'saved' ? <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />Saved to records</span>
            : <><Button onClick={doSave} busy={busy}>Save to records</Button><Button variant="soft" onClick={onEvaluate}>Evaluate again</Button></>}
          {saved && <span className="text-sm text-ink-700">{saved}</span>}
        </div>
      </Card>
    </div>
  );
}

export default function Page() {
  return <Suspense fallback={null}><VisitPage /></Suspense>;
}
