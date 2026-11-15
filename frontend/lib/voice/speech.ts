'use client';
// The browser's own voices and speech recognition: the FALLBACK of the voice assistant (the natural voice is lib/voice/tts.ts, the main ear is lib/voice/ear.ts).

export const LOCALE: Record<string, string> = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN', mr: 'mr-IN', te: 'te-IN', ta: 'ta-IN', gu: 'gu-IN', ur: 'ur-IN', kn: 'kn-IN', or: 'or-IN', ml: 'ml-IN' };
export const ENGLISH_NAME: Record<string, string> = { en: 'English', hi: 'Hindi', bn: 'Bengali', mr: 'Marathi', te: 'Telugu', ta: 'Tamil', gu: 'Gujarati', ur: 'Urdu', kn: 'Kannada', or: 'Odia', ml: 'Malayalam' };

// ---------------------------------------------------------------- speaking
const synth = () => (typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null);
let voices: SpeechSynthesisVoice[] = [];
const loadVoices = () => { const s = synth(); if (s) voices = s.getVoices(); };
if (typeof window !== 'undefined' && synth()) { loadVoices(); synth()!.addEventListener?.('voiceschanged', loadVoices); }

export const canSpeak = () => !!synth();

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const tag = LOCALE[lang] ?? 'en-IN'; const base = tag.split('-')[0];
  if (!voices.length) loadVoices();
  const score = (v: SpeechSynthesisVoice) => (v.lang.replace('_', '-') === tag ? 4 : v.lang.toLowerCase().startsWith(base) ? 3 : 0) + (/natural|neural|online|google/i.test(v.name) ? 1 : 0);
  const best = [...voices].sort((a, b) => score(b) - score(a))[0];
  return best && score(best) >= 3 ? best : (voices.find((v) => v.lang.toLowerCase().startsWith('en-in')) ?? voices.find((v) => v.lang.toLowerCase().startsWith('en')));
}
/** True when the device has a voice for this language (otherwise the answer is shown on screen and read in the closest voice). */
export const hasVoiceFor = (lang: string) => { if (!voices.length) loadVoices(); const b = (LOCALE[lang] ?? 'en-IN').split('-')[0]; return voices.some((v) => v.lang.toLowerCase().startsWith(b)); };

function chunks(text: string, max = 180): string[] {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?।۔])\s+/).filter(Boolean); const out: string[] = [];
  for (const p of parts) {
    if (p.length <= max) { out.push(p); continue; }
    let cur = ''; for (const w of p.split(' ')) { if ((cur + ' ' + w).length > max) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } if (cur.trim()) out.push(cur.trim());
  }
  return out;
}

let speakToken = 0;
/** Reads the text aloud. Resolves when it has finished, or when it was stopped. */
export function speak(text: string, lang: string, rate = 1, volume = 1): Promise<void> {
  const s = synth(); stopSpeaking();
  if (!s || !text.trim()) return Promise.resolve();
  const token = ++speakToken; const v = pickVoice(lang); const tag = v?.lang ?? LOCALE[lang] ?? 'en-IN';
  const parts = chunks(text);
  return new Promise((resolve) => {
    let i = 0;
    const next = () => {
      if (token !== speakToken || i >= parts.length) { if (token === speakToken) resolve(); else resolve(); return; }
      const piece = parts[i++]; const u = new SpeechSynthesisUtterance(piece); if (v) u.voice = v; u.lang = tag; u.rate = rate; u.pitch = 1; u.volume = Math.max(0.2, Math.min(1, volume));
      let done = false; const go = () => { if (done) return; done = true; clearTimeout(guard); next(); };
      const guard = setTimeout(go, 2500 + piece.length * 110 / rate);        // a browser that cannot speak (no voice installed) never says "finished": do not wait for it forever
      u.onend = go; u.onerror = go;
      s.speak(u);
    };
    next();
  });
}
export function stopSpeaking() { speakToken++; try { synth()?.cancel(); } catch { /* ignore */ } }

// ---------------------------------------------------------------- hearing
export interface ListenHandlers { onInterim: (t: string) => void; onFinal: (t: string) => void; onLevel: (v: number) => void; onError: (e: string) => void; }
export interface Listener { start: () => void; stop: () => void; pause: () => void; resume: () => void; }

type SR = { continuous: boolean; interimResults: boolean; lang: string; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void; onresult: ((e: any) => void) | null; onerror: ((e: any) => void) | null; onend: (() => void) | null; };
const SRClass = (): (new () => SR) | null => (typeof window === 'undefined' ? null : ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null));
export const canRecognize = () => !!SRClass();

/** A meter of the microphone: moves the orb while the CRP speaks. Independent of the recognition itself. */
function startMeter(onLevel: (v: number) => void) {
  let stream: MediaStream | null = null; let ctx: AudioContext | null = null; let raf = 0; let dead = false;
  navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((s) => {
    if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
    stream = s; const AC = window.AudioContext || (window as any).webkitAudioContext; ctx = new AC();
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(s).connect(an); const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let sum = 0; for (const b of buf) { const x = (b - 128) / 128; sum += x * x; } onLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5)); raf = requestAnimationFrame(tick); };
    tick();
  }).catch(() => { /* the recogniser asks for the microphone too: its error is reported there */ });
  return () => { dead = true; cancelAnimationFrame(raf); stream?.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => {}); onLevel(0); };
}

/** Listening with the browser's speech recognition. It restarts by itself, because the browser stops it after some silence. */
function browserListener(lang: string, h: ListenHandlers): Listener {
  const C = SRClass()!; let rec: SR | null = null; let wanted = false; let paused = false; let stopMeter: (() => void) | null = null; let fails = 0; let tag = LOCALE[lang] ?? 'en-IN';
  const make = () => {
    const r = new C(); r.continuous = true; r.interimResults = true; r.lang = tag; r.maxAlternatives = 1;
    r.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t: string = e.results[i][0].transcript;
        if (e.results[i].isFinal) { fails = 0; if (t.trim()) h.onFinal(t.trim()); } else interim += t;
      }
      h.onInterim(interim.trim());
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { wanted = false; h.onError('mic-denied'); }
      else if (e.error === 'audio-capture') { wanted = false; h.onError('no-mic'); }
      else if (e.error === 'language-not-supported') { tag = 'en-IN'; }          // this browser cannot hear that language: listen for English instead of failing in a loop
      else if (e.error === 'network') { fails++; if (fails > 3) { wanted = false; h.onError('network'); } }
    };
    r.onend = () => { rec = null; if (wanted && !paused) setTimeout(go, fails ? 600 : 250); };
    return r;
  };
  const go = () => { if (!wanted || paused || rec) return; try { rec = make(); rec.start(); } catch { rec = null; setTimeout(go, 400); } };
  return {
    start() { wanted = true; paused = false; stopMeter ??= startMeter(h.onLevel); go(); },
    stop() { wanted = false; try { rec?.abort(); } catch { /* ignore */ } rec = null; stopMeter?.(); stopMeter = null; },
    pause() { paused = true; try { rec?.abort(); } catch { /* ignore */ } rec = null; },       // not listening while the assistant speaks (it would hear itself)
    resume() { paused = false; go(); },
  };
}

export function makeListener(lang: string, h: ListenHandlers): Listener | null {
  return canRecognize() ? browserListener(lang, h) : null;
}
