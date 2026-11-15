'use client';
// The voice of the assistant. The text is spoken by natural neural voices made on the server (POST /api/voice/speak, Microsoft's neural voices; ElevenLabs when the host has a key).
// To make it flow like a person talking and never stop in the middle:
//   * the answer is cut into sentences and ALL of them are asked for at once, so while the first one is playing the next ones are already here;
//   * every sentence is scheduled on the audio clock to start exactly when the previous one ends (no gap, no click);
//   * short phrases that come back (the greeting, "One moment") are kept decoded, so they start at once;
//   * if the voice service cannot be reached, the browser's own voice takes over for that answer, so the assistant is never silent.
import { apiUrl } from '@/lib/platform';
import { session } from '@/lib/auth';
import { speak as speakBrowser, stopSpeaking as stopBrowser } from './speech';
import { addDebug } from './debug';

export interface VoicePrefs { gender: 'male' | 'female'; accent: 'gb' | 'us' | 'in'; rate: number; volume: number; }
export const DEFAULT_VOICE: VoicePrefs = { gender: 'male', accent: 'gb', rate: 1.0, volume: 1.0 };

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let meter: AnalyserNode | null = null;
let sources: AudioBufferSourceNode[] = [];
let waiters: (() => void)[] = [];                                    // what a speech waits for: the end of each sentence (also called when the voice is stopped, or the speech would wait for ever)
let token = 0;
let controller: AbortController | null = null;
let serverDownUntil = 0;
const decoded = new Map<string, Promise<AudioBuffer>>();

/** Must run from a click or key press (browsers keep sound off until then): called when voice mode is switched on. */
export function unlockAudio() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC(); out = ctx.createGain(); meter = ctx.createAnalyser(); meter.fftSize = 512; out.connect(meter); meter.connect(ctx.destination);
  }
  void ctx.resume().catch(() => {});
}

/** How loud the assistant is right now (0..1): the circle breathes with its voice. */
export function outputLevel(): number {
  if (!meter) return 0;
  const b = new Uint8Array(meter.fftSize); meter.getByteTimeDomainData(b);
  let s = 0; for (const v of b) { const x = (v - 128) / 128; s += x * x; }
  return Math.min(1, Math.sqrt(s / b.length) * 4);
}

function pieces(text: string): string[] {
  const sents = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?।۔])\s+/).filter(Boolean);
  const out: string[] = [];
  for (const s of sents) {
    if (s.length > 170) { let cur = ''; for (const w of s.split(/(?<=,|;|:)\s+|\s+/)) { if ((cur + ' ' + w).trim().length > 150 && cur) { out.push(cur.trim()); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) out.push(cur); }
    else out.push(s);
  }
  const merged: string[] = [];                                       // a very short sentence is spoken together with the next one (more natural, fewer requests)
  for (const s of out) { if (merged.length && merged[merged.length - 1].length < 26) merged[merged.length - 1] += ' ' + s; else merged.push(s); }
  while (merged.length > 6) { const a = merged.pop()!; merged[merged.length - 1] += ' ' + a; }
  return merged;
}

function load(text: string, lang: string, p: VoicePrefs, signal?: AbortSignal): Promise<AudioBuffer> {
  const key = `${lang}|${p.gender}|${p.accent}|${p.rate}|${text}`;
  const hit = decoded.get(key); if (hit) return hit;
  const job = (async () => {
    if (!ctx) unlockAudio();
    const tok = session.token();
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 25000);          // a voice service that never answers must not block the queue
    signal?.addEventListener('abort', () => ctl.abort());
    try {
      const r = await fetch(apiUrl('/api/voice/speak'), { method: 'POST', signal: ctl.signal, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
        body: JSON.stringify({ text, language: lang, gender: p.gender, accent: p.accent, rate: p.rate }) });
      if (!r.ok) throw new Error(`voice ${r.status}`);
      return await ctx!.decodeAudioData(await r.arrayBuffer());
    } finally { clearTimeout(timer); }
  })();
  decoded.set(key, job);
  job.catch(() => decoded.delete(key));
  if (decoded.size > 80) decoded.delete(decoded.keys().next().value as string);
  return job;
}

/** Asks for a phrase in advance, so it can be played the moment it is needed. */
export function prefetch(text: string, lang: string, p: VoicePrefs) { void load(text, lang, p).catch(() => {}); }

export function stopNatural() {
  token++; controller?.abort(); controller = null;
  for (const s of sources) { try { s.onended = null; s.stop(); } catch { /* already finished */ } }
  sources = []; stopBrowser();
  const w = waiters; waiters = []; for (const f of w) f();               // a speech that was waiting for its last sentence must not wait for ever: the voice queue would stay blocked and the assistant would stay silent
}

/** Speaks the text. Resolves when it has finished or has been stopped. `onStart` is called when the first words begin. */
export async function speakNatural(text: string, lang: string, p: VoicePrefs, onStart?: () => void): Promise<'done' | 'stopped'> {
  stopNatural(); const my = token; unlockAudio();
  if (out) out.gain.value = Math.max(0.2, Math.min(1.6, p.volume ?? 1));            // the assistant's own volume (louder / quieter by voice or in the settings)
  if (Date.now() < serverDownUntil) { onStart?.(); await speakBrowser(text, lang, p.rate, p.volume); return my === token ? 'done' : 'stopped'; }
  controller = new AbortController();
  const parts = pieces(text); const loads = parts.map((t) => load(t, lang, p, controller!.signal));
  let when = 0; let started = false; const ended: Promise<void>[] = [];
  try {
    for (let i = 0; i < loads.length; i++) {
      const buf = await loads[i]; if (my !== token) return 'stopped';
      const at = Math.max(ctx!.currentTime + 0.03, when);
      const src = ctx!.createBufferSource(); src.buffer = buf; src.connect(out!); src.start(at); sources.push(src);
      when = at + buf.duration;
      ended.push(new Promise<void>((res) => { src.onended = () => res(); waiters.push(res); }));
      if (!started) { started = true; onStart?.(); }
    }
    addDebug('spoken', `${parts.length} parts, ${(when - (ctx!.currentTime - 0)).toFixed(1)}s still to play when the last was queued`);
    await Promise.all(ended);
    addDebug('spoken-end', my === token ? 'finished' : 'stopped');
    return my === token ? 'done' : 'stopped';
  } catch {
    if (my !== token) return 'stopped';
    if (!started) { serverDownUntil = Date.now() + 45000; onStart?.(); await speakBrowser(text, lang, p.rate, p.volume); return my === token ? 'done' : 'stopped'; }   // the natural voice failed: the browser's voice reads this answer
    return 'done';
  }
}
