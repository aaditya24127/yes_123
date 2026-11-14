'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, ChevronLeft, FileText, Keyboard, Mic, RotateCcw, Send, Volume2 } from 'lucide-react';
import { api, type Assessment } from '@/lib/api';
import { useHome } from '@/lib/hooks';
import { canRecord, canSpeak, primeSpeech, speak, startRecorder, stopSpeaking, type Recorder } from '@/lib/voice';
import Shell from '@/components/Shell';
import { VoiceOrb, type OrbState } from '@/components/VoiceOrb';
import AssessmentReport from '@/components/AssessmentReport';
import { Button, Card } from '@/components/ui';
import { useLang } from '@/lib/i18n';

type Phase = 'intro' | 'reading' | 'listening' | 'saving' | 'noted' | 'writing' | 'report';

function Flow() {
  const { tr } = useLang();
  const wanted = useSearchParams().get('id');
  const { data, error } = useHome();
  const [a, setA] = useState<Assessment | null>(null);
  const [missing, setMissing] = useState(false);
  const [phase, setPhase] = useState<Phase>('intro');
  const [idx, setIdx] = useState(0);
  const [level, setLevel] = useState(0);
  const [noting, setNoting] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const rec = useRef<Recorder | null>(null);
  const run = useRef(0);                       // a new number each time a question starts, so an old read-aloud cannot start the microphone late

  // Open the assessment asked for in the link, or the newest one that still needs the teacher (or the newest report).
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const list = await api.assessments();
        const x = list.find((y) => y.id === wanted) ?? list.find((y) => y.status === 'ready' || y.status === 'in_progress' || y.status === 'submitted') ?? list[0];
        if (off) return;
        if (!x) { setMissing(true); return; }
        setA(x);
        if (x.status === 'reported') setPhase('report');
        else if (x.status === 'submitted') setPhase('writing');
      } catch { if (!off) setMissing(true); }
    })();
    return () => { off = true; };
  }, [wanted]);

  useEffect(() => () => { run.current++; stopSpeaking(); rec.current?.cancel(); }, []);

  const q = a?.questions[idx];

  // Switch the microphone on for the question on screen. `keep` leaves the message that is already shown (for example "we could not hear you").
  const listen = useCallback(async (keep = false) => {
    if (!keep) setErr('');
    setText('');
    if (!canRecord() || typing) { setPhase('listening'); return; }
    try { rec.current = await startRecorder(setLevel); setPhase('listening'); }
    catch { setTyping(true); setErr(tr('The microphone is not available. Please allow it in your browser, or type your answer below.')); setPhase('listening'); }
  }, [typing]);

  const ask = useCallback(async (i: number, x: Assessment) => {
    const token = ++run.current;
    rec.current?.cancel(); rec.current = null;
    setIdx(i); setErr(''); setPhase('reading'); setNoting(false);
    await speak(x.questions[i].question);
    if (token !== run.current) return;
    await listen();
  }, [listen]);

  const begin = async () => {
    if (!a) return;
    primeSpeech();
    setBusy(true); setErr('');
    try {
      const v = await api.assessmentStart(a.id);
      setA(v);
      const first = Math.max(0, v.questions.findIndex((x) => !x.answered));
      await ask(first, v);
    } catch (e) { setErr(e instanceof Error ? e.message : tr('Could not start.')); }
    setBusy(false);
  };

  // Type instead of speaking (or back to the voice): the microphone is switched off or on for the same question.
  const toggleTyping = async () => {
    rec.current?.cancel(); rec.current = null; setLevel(0); setErr('');
    if (!typing) { setTyping(true); return; }
    setTyping(false);
    try { rec.current = await startRecorder(setLevel); } catch { setTyping(true); setErr(tr('The microphone is not available. Please allow it in your browser, or type your answer.')); }
  };

  const skipReading = () => { run.current++; stopSpeaking(); void listen(); };  const replay = () => { if (a) void ask(idx, a); };

  const done = async () => {
    if (!a || !q) return;
    setErr('');
    let blob: Blob | undefined;
    if (typing || !rec.current) {
      if (!text.trim()) { setErr(tr('Please type your answer first.')); return; }
    } else {
      const r = await rec.current.stop(); rec.current = null; setLevel(0);
      if (!r.heard || r.seconds < 1.5) { setErr(tr('We did not hear you. Please answer again.')); await listen(true); return; }
      blob = r.blob;
    }
    setPhase('saving');
    try {
      await api.assessmentAnswer(a.id, q.n, blob ? { blob } : { text });
      const next = { ...a, questions: a.questions.map((x) => (x.n === q.n ? { ...x, answered: true } : x)) };
      setA(next); setPhase('noted'); setNoting(true);
      await speak('Noted.'); setNoting(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : tr('Could not save your answer.'));
      await listen(true);
    }
  };

  const next = () => { if (a) void ask(idx + 1, a); };

  const finish = async () => {
    if (!a) return;
    setErr(''); setPhase('writing');
    try { setA(await api.assessmentFinish(a.id)); } catch (e) { setErr(e instanceof Error ? e.message : tr('Could not start the report.')); setPhase('noted'); }
  };

  // While the report is being written, ask again every few seconds.
  useEffect(() => {
    if (phase !== 'writing' || !a) return;
    let off = false;
    const tick = async () => {
      try {
        const v = await api.assessment(a.id);
        if (off) return;
        if (v.status === 'reported') { setA(v); setPhase('report'); }
        else if (v.error && v.status !== 'submitted') { setErr(v.error); }
      } catch { /* try again */ }
    };
    const id = setInterval(tick, 3000); void tick();
    return () => { off = true; clearInterval(id); };
  }, [phase, a?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const orb: OrbState = phase === 'reading' || noting ? 'speaking' : phase === 'listening' && !typing ? 'listening' : phase === 'saving' || phase === 'writing' ? 'thinking' : 'idle';
  const last = !!q?.last;
  const answered = a?.questions.filter((x) => x.answered).length ?? 0;

  const frame = (children: React.ReactNode) => (
    <Shell home={data} error={error}>
      <Link href="/" className="-mt-2 mb-1 inline-flex items-center gap-1 py-2 pe-3 text-sm font-semibold text-brand-700"><ChevronLeft size={16} />{tr('Home')}</Link>
      {children}
    </Shell>
  );

  if (missing) return frame(<Card><p className="text-ink-700">{tr('There is no assessment waiting for you right now. When your mentor asks for one, you will get an alert.')}</p></Card>);
  if (!a) return frame(<p className="py-20 text-center text-ink-500">{tr('Loading…')}</p>);

  if (phase === 'report' && a.report) return frame(<AssessmentReport a={a} />);

  if (phase === 'intro') {
    return frame(
      <Card className="text-center">
        <div className="flex justify-center py-4"><VoiceOrb state="idle" size={160} /></div>
        <h1 className="font-serif text-2xl font-semibold text-ink-900">{tr('Short assessment')}</h1>
        <p className="mt-1 text-ink-700">{tr(a.subject)}{a.class_no ? tr(', Class {class_no}', { class_no: a.class_no }) : ''}: <b>{tr(a.chapter)}</b></p>
        <p className="mt-3 text-sm text-ink-500">{tr('{n} questions, asked aloud, one at a time. Answer by speaking. Press Done when you have finished each answer. It takes about {minutes} minutes. Your recording is turned into words and then deleted.', { n: a.count, minutes: Math.max(8, a.count * 2) })}</p>
        {a.status === 'preparing' ? <p className="mt-4 text-sm text-ink-500">{tr('The questions are still being prepared. Please wait a moment.')}</p> : null}
        {err && <p role="alert" className="mt-4 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{tr(err)}</p>}
        <Button className="mt-5 w-full" busy={busy} disabled={a.status === 'preparing' || a.status === 'failed'} onClick={begin}><Mic size={16} />{answered ? tr('Continue assessment') : tr('Start Assessment')}</Button>
        {!canRecord() && <p className="mt-3 text-xs text-ink-500">{tr('This browser cannot record. You will type your answers instead.')}</p>}
      </Card>,
    );
  }

  const shownQ = a.questions[idx];
  return frame(
    <Card className="text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">{tr('Question {x} of {length}', { x: idx + 1, length: a.questions.length })}</p>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(answered / a.questions.length) * 100}%` }} /></div>
      <div className="flex justify-center py-5"><VoiceOrb state={orb} level={level} size={150}
        word={phase === 'noted' ? (noting ? 'Noted' : 'Ready') : phase === 'writing' ? tr('Writing your report') : phase === 'saving' ? tr('Noting your answer') : undefined} /></div>

      {phase !== 'writing' && <h2 className="font-serif text-xl font-semibold leading-snug text-ink-900">{tr(shownQ.question)}</h2>}

      {phase === 'reading' && (
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="soft" onClick={skipReading}>{tr('Answer now')}</Button>
        </div>
      )}

      {phase === 'listening' && (
        <div className="mt-4">
          {typing && (
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} placeholder={tr('Type your answer here')} autoFocus
              className="mb-3 w-full rounded-2xl border-0 bg-page px-4 py-3 text-left text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
          )}
          {!typing && <p className="mb-3 flex items-center justify-center gap-2 text-sm text-ink-500"><Mic size={16} className="text-brand-600" />{tr('Speak now. Press Done when you have finished.')}</p>}
          {err && <p role="alert" className="mb-3 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">{tr(err)}</p>}
          <Button className="w-full" onClick={done}><CheckCircle2 size={16} />{tr('Done')}</Button>
          <div className="mt-3 flex flex-wrap justify-center gap-1 text-sm">
            {canSpeak() && <Button variant="ghost" onClick={replay}><Volume2 size={15} />{tr('Hear again')}</Button>}
            {canRecord() && <Button variant="ghost" onClick={toggleTyping}>
              {typing ? <><Mic size={15} />{tr('Use voice')}</> : <><Keyboard size={15} />{tr('Type instead')}</>}</Button>}
          </div>
        </div>
      )}

      {phase === 'saving' && <p className="mt-4 text-sm text-ink-500">{tr('Saving your answer…')}</p>}

      {phase === 'noted' && (
        <div className="mt-4">
          {err && <p role="alert" className="mb-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{tr(err)}</p>}
          {last
            ? <Button className="w-full" onClick={finish}><Send size={16} />{tr('Generate Report')}</Button>
            : <Button className="w-full" onClick={next}>{tr('Next')}<ArrowRight size={16} /></Button>}
          <Button variant="ghost" className="mt-1" onClick={() => void ask(idx, a)}><RotateCcw size={15} />{tr('Answer this one again')}</Button>
        </div>
      )}

      {phase === 'writing' && (
        <div className="mt-2">
          <h2 className="font-serif text-xl font-semibold text-ink-900">{tr('Writing your report')}</h2>
          <p className="mt-1 text-sm text-ink-500">{tr('This takes about half a minute. Please keep this page open.')}</p>
          {err && <p role="alert" className="mt-3 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{tr(err)}</p>}
          {err && <Button className="mt-3" variant="soft" onClick={finish}>{tr('Try again')}</Button>}
        </div>
      )}
      {phase !== 'writing' && phase !== 'noted' && <p className="mt-4 flex items-center justify-center gap-1 text-xs text-ink-400"><FileText size={13} />{tr('{n} of {total} answered', { n: answered, total: a.questions.length })}</p>}
    </Card>,
  );
}

export default function Page() {
  return <Suspense fallback={null}><Flow /></Suspense>;
}
