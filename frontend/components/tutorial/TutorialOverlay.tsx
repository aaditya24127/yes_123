'use client';
// The tutorial layer: a strip of text (like a game hint), a glowing ring around the thing being explained, a tapping hand when the
// person has to tap, and a friendly voice. It sits above the app and lets every tap through, so the real screens work as usual.
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, GraduationCap, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { LANGS, useLang } from '@/lib/i18n';
import { useUser } from '@/lib/auth';
import { CHAPTERS, STEPS, firstOfChapter, indexOfStep, type ChapterId } from '@/lib/tutorial/steps';
import { SPEEDS, tutorial, useTutorial } from '@/lib/tutorial/store';
import { useTutorialText } from '@/lib/tutorial/text';
import { isBarePath } from '@/components/shell/AuthGate';

type Box = { x: number; y: number; w: number; h: number; r: number };

const norm = (p: string | null | undefined) => (p ?? '/').replace(/\/+$/, '') || '/';
function onScreen(el: Element) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}
function find(sel?: string): HTMLElement | null {
  if (!sel) return null;
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) if (onScreen(el)) return el;
  return null;
}
/** A condition is a page ('/visit') or something on the screen (a selector). */
const met = (cond: string) => (cond.startsWith('/') ? norm(window.location.pathname) === cond : !!find(cond));

export default function TutorialOverlay() {
  const st = useTutorial();
  const path = usePathname();
  if (!st.on || isBarePath(path)) return null;
  return <Guide i={st.i} muted={st.muted} speed={st.speed} />;
}

function Guide({ i, muted, speed }: { i: number; muted: boolean; speed: number }) {
  const { lang, dir } = useLang();
  const text = useTutorialText(lang);
  const user = useUser();
  const router = useRouter();
  const step = STEPS[Math.min(i, STEPS.length - 1)];
  const [box, setBox] = useState<Box | null>(null);
  const [off, setOff] = useState(false);            // the person is on another page than this step needs
  const [view, setView] = useState({ w: 1280, h: 800 });

  const next = useCallback(() => { if (i >= STEPS.length - 1) tutorial.stop(); else tutorial.go(i + 1); }, [i]);

  // ---------------------------------------------------------------- follow the screen: find the target, notice when the step is done
  useEffect(() => {
    const born = Date.now();
    let scrolled = false, seen = false, first: string | null = null, changedAt = 0, done = false;
    setBox(null); setOff(false);
    const tick = () => {
      if (done) return;
      const age = Date.now() - born;
      const finish = (fn: () => void) => { done = true; fn(); };
      const here = norm(window.location.pathname);
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      if (age > 500 && step.skipIf && met(step.skipIf)) return finish(next);
      if (step.advance === 'route' && step.when && age > 150 && here === step.when) return finish(next);
      const onPage = step.path === '*' || here === step.path;
      if (!onPage) { setBox(null); setOff(true); return; }
      setOff(false);
      if (step.needs && step.back && age > 2500 && !find(step.needs)) return finish(() => tutorial.go(indexOfStep(step.back!)));
      if (step.advance === 'appear' && step.when && age > 300 && find(step.when)) return finish(next);
      if (step.advance === 'gone' && step.when) { if (find(step.when)) seen = true; else if (seen || age > 1500) return finish(next); }
      const el = find(step.target);
      if (!el) { if (step.optional && step.target && age > 3000) return finish(next); setBox(null); return; }
      if (step.advance === 'value') {
        const v = (el as HTMLSelectElement).value ?? '';
        if (first === null) first = v;
        else if (v && v !== first) { if (!changedAt) changedAt = Date.now(); else if (Date.now() - changedAt > 900) return finish(next); }
      }
      const r = el.getBoundingClientRect();
      if (!scrolled) {
        scrolled = true;
        const hidden = r.top < 70 || r.bottom > window.innerHeight - 150;
        if (hidden) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? 'start' : 'center', behavior: 'smooth' });
      }
      const rad = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12;
      setBox((b) => (b && Math.abs(b.x - r.left) < 0.5 && Math.abs(b.y - r.top) < 0.5 && Math.abs(b.w - r.width) < 0.5 && Math.abs(b.h - r.height) < 0.5 ? b
        : { x: r.left, y: r.top, w: r.width, h: r.height, r: Math.min(rad, 40) }));
    };
    tick();
    const h = setInterval(tick, 200);
    window.addEventListener('scroll', tick, true); window.addEventListener('resize', tick);
    return () => { done = true; clearInterval(h); window.removeEventListener('scroll', tick, true); window.removeEventListener('resize', tick); };
  }, [step, next]);

  // ---------------------------------------------------------------- the words
  const key = off ? 'offpage' : step.id === 'welcome' && user?.salutation && text.steps[`welcome_${user.salutation}`] ? `welcome_${user.salutation}` : step.id;
  const line = text.steps[key] ?? text.steps[step.id];
  const locale = LANGS.find((l) => l.code === lang)?.locale ?? 'en-IN';

  // ---------------------------------------------------------------- the voice
  const audio = useRef<HTMLAudioElement | null>(null);
  const speedRef = useRef(speed); speedRef.current = speed;
  useEffect(() => { if (audio.current) audio.current.playbackRate = speed; }, [speed]);          // a new speed counts at once, also in the middle of a sentence
  const hush = useCallback(() => {
    if (audio.current) { audio.current.onerror = null; audio.current.pause(); audio.current = null; }
    try { window.speechSynthesis?.cancel(); } catch { /* no speech on this device */ }
  }, []);
  const say = useCallback(() => {
    hush();
    if (muted || !line || !text.ready) return;
    // A recorded friendly voice for each language; if a file is missing, the device's own voice for that language (if it has one).
    const speak = () => {
      try {
        const synth = window.speechSynthesis; if (!synth) return;
        const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang));
        if (!voice) return;
        const u = new SpeechSynthesisUtterance(line.v); u.voice = voice; u.lang = locale; u.rate = 0.95 * speedRef.current; synth.speak(u);
      } catch { /* stay silent */ }
    };
    const a = new Audio(`/tutorial/voice/${lang}/${key}.mp3`);
    audio.current = a; a.playbackRate = speedRef.current;
    a.onerror = () => { if (audio.current === a) speak(); };
    a.play().catch((e: { name?: string }) => {
      // Browsers only play sound after the person has touched the page: try again at their next tap.
      if (e?.name === 'NotAllowedError') {
        const again = () => { if (audio.current === a) a.play().catch(() => {}); };
        window.addEventListener('pointerdown', again, { once: true });
      }
    });
  }, [hush, muted, line, lang, key, locale, text.ready]);
  useEffect(() => { say(); return hush; }, [say, hush]);

  // ---------------------------------------------------------------- where things go
  const phone = view.w < 768;
  const atTop = !!box && box.y + box.h / 2 > view.h * 0.5;          // keep the strip away from what it talks about
  const ring = box && { left: box.x - 6, top: box.y - 6, width: box.w + 12, height: box.h + 12, borderRadius: box.r + 6 };
  let hand: { left: number; top: number; up: boolean } | null = null;
  if (box && step.point) {
    const cx = Math.max(8, Math.min(view.w - 48, box.x + box.w / 2 - 20));
    const roomBelow = box.y + box.h + 62 < view.h - (atTop ? 0 : phone ? 190 : 120);
    if (box.h > 170) hand = { left: cx, top: box.y + box.h / 2 - 10, up: true };              // a big thing: tap in the middle of it
    else if (roomBelow) hand = { left: cx, top: box.y + box.h + 6, up: true };
    else hand = { left: cx, top: box.y - 54, up: false };
  }

  if (!text.ready) return null;
  const waits = !off && step.advance !== 'next' && step.advance !== 'finish';
  const showNext = !off && (step.advance === 'next' || step.canSkip);
  const total = STEPS.length;
  const u = text.ui;
  const jump = (c: string) => tutorial.go(firstOfChapter(c as ChapterId));
  const icon = 'flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition hover:bg-white/15 hover:text-white';

  return (
    <div className="pointer-events-none fixed inset-0 z-[200]" aria-live="polite">
      {ring && <div className="tut-ring absolute" style={ring} />}
      {hand && <div className="tut-hand absolute select-none text-[40px] leading-none" style={{ left: hand.left, top: hand.top }} aria-hidden>{hand.up ? '👆' : '👇'}</div>}

      <div dir={dir} data-tour-banner data-tour-step={step.id} className={`pointer-events-auto absolute inset-x-0 border-y border-white/10 bg-brand-900/90 shadow-panel backdrop-blur-sm ${atTop ? 'top-0' : phone ? 'bottom-[68px]' : 'bottom-0'}`}>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap sm:px-6">
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-white/20 sm:flex"><GraduationCap size={22} /></span>
          <div className="min-w-0 flex-1 basis-full sm:basis-auto">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-white/60">
              <select value={step.chapter} onChange={(e) => jump(e.target.value)} aria-label={u.parts} title={u.parts}
                className="max-w-[55%] cursor-pointer truncate rounded-md border-0 bg-white/10 px-1.5 py-0.5 !text-[11px] font-semibold text-white/85 outline-none hover:bg-white/20">
                {CHAPTERS.map((c) => <option key={c} value={c} className="text-ink-900">{text.chapters[c]}</option>)}
              </select>
              <span className="tabular-nums">{u.step.replace('{n}', String(i + 1)).replace('{t}', String(total))}</span>
            </div>
            <p className="mt-1 text-[17px] font-semibold leading-snug text-white sm:text-xl" style={{ textShadow: '0 1px 2px rgb(0 0 0 / 0.35)' }}>{line?.t}</p>
            {waits && <p className="mt-0.5 text-xs text-white/60">{u.waiting}</p>}
          </div>
          <div className="ms-auto flex shrink-0 items-center gap-1">
            {i > 0 && <button onClick={() => tutorial.go(i - 1)} aria-label={u.back} title={u.back} className={icon}><ChevronLeft size={20} className="rtl:rotate-180" /></button>}
            <button onClick={() => tutorial.speed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])} data-tour-speed aria-label={`${u.speed}: ${speed}x`} title={`${u.speed}: ${speed}x`}
              className={`${icon} !w-auto px-2.5 text-xs font-bold tabular-nums`}>{speed}x</button>
            <button onClick={say} aria-label={u.replay} title={u.replay} className={icon}><RotateCcw size={17} /></button>
            <button onClick={() => tutorial.mute(!muted)} aria-label={muted ? u.voiceOn : u.voiceOff} title={muted ? u.voiceOn : u.voiceOff} aria-pressed={!muted} className={icon}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
            {off && <button onClick={() => router.push(step.path === '*' ? '/' : step.path)} className="ms-1 flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-float hover:bg-brand-50">{u.goThere}<ChevronRight size={16} className="rtl:rotate-180" /></button>}
            {showNext && <button onClick={next} data-tour-next className="ms-1 flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-float hover:bg-brand-50">{u.next}<ChevronRight size={16} className="rtl:rotate-180" /></button>}
            {!off && step.advance === 'finish' && <button onClick={() => tutorial.stop()} data-tour-next className="ms-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-800 shadow-float hover:bg-brand-50">{u.finish}</button>}
            <button onClick={() => tutorial.stop()} aria-label={u.exit} title={u.exit} className={icon}><X size={19} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
