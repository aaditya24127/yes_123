'use client';
// "Teacher assessment" on the Visit page (before the visit): the CRP only presses Start assessment and chooses how many questions.
// The teacher answers by voice in the teacher app; this panel follows it (with the glowing circle) and shows the report when it is ready.
import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, FileDown, RefreshCw, Send, X } from 'lucide-react';
import AssessmentReport from '@/components/AssessmentReport';
import { Badge, Button, Card, ErrorNote, Field, Select } from '@/components/ui';
import { VoiceOrb, type OrbState } from '@/components/ui/VoiceOrb';
import { api } from '@/lib/api';
import { usePoll } from '@/lib/hooks';
import type { AiChoice, Assessment } from '@/lib/types';
import { fmtDay } from '@/lib/visit-text';

const ACTIVE = ['preparing', 'ready', 'in_progress', 'submitted'];
const ORB: Record<string, OrbState> = { preparing: 'thinking', ready: 'idle', in_progress: 'listening', submitted: 'thinking', reported: 'idle', failed: 'idle' };
const AI_WORD: Record<AiChoice, string> = { auto: 'Automatic (Claude, then free models)', claude: 'Claude first', free: 'Free models first' };
const tone = (v: number | null | undefined) => (v == null ? 'text-ink-400' : v >= 70 ? 'text-emerald-700' : v >= 50 ? 'text-amber-700' : 'text-red-700');

function statusText(a: Assessment) {
  switch (a.status) {
    case 'preparing': return 'Writing the questions…';
    case 'ready': return 'Sent to the teacher. Waiting for them to start.';
    case 'in_progress': return `The teacher is answering: ${a.answered} of ${a.count} done.`;
    case 'submitted': return 'All answers are in. Writing the report…';
    case 'reported': return 'Report ready.';
    case 'failed': return a.error || 'The questions could not be written.';
    default: return a.status;
  }
}

export default function AssessmentPanel({ teacher, classNo, subject, chapter }: { teacher?: { id: string; name: string }; classNo?: number | null; subject?: string; chapter: string }) {
  const [count, setCount] = useState('8');
  const [ai, setAi] = useState<AiChoice>('auto');
  const [list, setList] = useState<Assessment[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [full, setFull] = useState<Assessment | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (!teacher) { setList([]); return Promise.resolve(); }
    return api.assessments.list(teacher.id).then((x) => setList(x.slice(0, 4))).catch(() => undefined);
  }, [teacher]);
  useEffect(() => { void load(); }, [load]);
  const active = list.some((a) => ACTIVE.includes(a.status));
  usePoll(active, () => { void load(); }, 4000);

  const waiting = list.find((a) => ['preparing', 'ready', 'in_progress', 'submitted'].includes(a.status));
  const can = !!teacher && !!subject && !!chapter.trim() && !waiting;
  const why = !teacher ? 'Choose a teacher above first.' : !subject ? 'Choose the subject above first.' : !chapter.trim() ? 'Choose the chapter above first.' : waiting ? 'This teacher already has an assessment waiting.' : '';

  const run = async (label: string, fn: () => Promise<unknown>) => { setBusy(label); setError(''); try { await fn(); await load(); } catch (e) { setError((e as Error).message); } finally { setBusy(''); } };
  const start = () => run('start', () => api.assessments.start({ teacher_id: teacher!.id, class_no: classNo ?? null, subject: subject!, chapter: chapter.trim(), question_count: Number(count), ai_choice: ai }));
  const toggle = async (a: Assessment) => {
    if (open === a.id) { setOpen(null); return; }
    setOpen(a.id); setFull(null);
    try { setFull(await api.assessments.get(a.id)); } catch (e) { setError((e as Error).message); }
  };

  return (
    <Card tour="v-assess" title="Teacher assessment" subtitle="Spoken questions for the teacher, before your visit. They answer in the teacher app and you get a report.">
      <ErrorNote error={error} onClose={() => setError('')} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Number of questions" hint="About 6 in 10 check the topic, 4 in 10 the way it is taught. The last one asks for the full lesson plan.">
          <Select value={count} onChange={(e) => setCount(e.target.value)}>{[5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n} questions</option>)}</Select></Field>
        <Field label="AI to use" hint="Switches by itself if one is unavailable.">
          <Select value={ai} onChange={(e) => setAi(e.target.value as AiChoice)}>{(Object.keys(AI_WORD) as AiChoice[]).map((k) => <option key={k} value={k}>{AI_WORD[k]}</option>)}</Select></Field>
        <div className="flex flex-col justify-end"><Button onClick={start} busy={busy === 'start'} disabled={!can} icon={<Send size={16} />}>Start assessment</Button></div>
      </div>
      <p className="mt-2 text-xs text-ink-500">{why || `${teacher!.name}${classNo ? ` · Class ${classNo}` : ''} · ${subject} · ${chapter}`}</p>

      {list.length > 0 && (
        <div className="mt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Assessments for {teacher?.name}</p>
          {list.map((a) => (
            <div key={a.id} className="rounded-2xl bg-page p-3 ring-1 ring-brand-100">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <div className="shrink-0"><VoiceOrb state={ORB[a.status] ?? 'idle'} size={52} caption={false} /></div>
                <div className="min-w-0 flex-1 basis-[10rem]">
                  <p className="font-semibold leading-snug text-ink-900">{a.subject}{a.class_no ? `, Class ${a.class_no}` : ''}: {a.chapter}</p>
                  <p className="text-sm text-ink-500">{statusText(a)} <span className="text-xs text-ink-400">· {a.count} questions · {fmtDay(a.requested_at)}</span></p>
                  {a.status === 'reported' && a.scores && (
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm">
                      <span>Overall <b className={tone(a.scores.overall)}>{a.scores.overall ?? '-'}</b></span>
                      <span className="text-ink-500">Topic <b className={tone(a.scores.knowledge)}>{a.scores.knowledge ?? '-'}</b></span>
                      <span className="text-ink-500">Teaching <b className={tone(a.scores.teaching)}>{a.scores.teaching ?? '-'}</b></span>
                      {a.report_by && <Badge tone="neutral">{a.report_by.split(' ')[0].replace('_', ' ')}</Badge>}
                    </p>
                  )}
                </div>
                <div className="flex w-full flex-wrap items-center justify-end gap-1 sm:w-auto sm:shrink-0">
                  {a.status === 'reported' && <>
                    <Button variant="ghost" onClick={() => toggle(a)} icon={open === a.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}>{open === a.id ? 'Hide' : 'View'}</Button>
                    <a href={api.assessments.pdfUrl(a.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-2xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><FileDown size={16} />PDF</a>
                  </>}
                  {(a.status === 'failed' || a.status === 'reported') && <Button variant="ghost" busy={busy === `re${a.id}`} onClick={() => run(`re${a.id}`, () => api.assessments.rebuild(a.id, ai))} icon={<RefreshCw size={15} />}>Write again</Button>}
                  {ACTIVE.includes(a.status) && <Button variant="ghost" busy={busy === `c${a.id}`} onClick={() => run(`c${a.id}`, () => api.assessments.cancel(a.id))} icon={<X size={15} />}>Cancel</Button>}
                </div>
              </div>
              {open === a.id && (full?.id === a.id && full.report ? <div className="mt-3"><AssessmentReport a={{ subject: full.subject, class_no: full.class_no, chapter: full.chapter, report: full.report, pdf_url: null }} who={teacher?.name} /></div> : <p className="mt-3 text-sm text-ink-500">Loading the report…</p>)}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
