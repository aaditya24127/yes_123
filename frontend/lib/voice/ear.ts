'use client';
// The ear of the voice assistant: it listens to the microphone, notices by itself when the CRP starts and stops speaking, and hands over each spoken sentence as a small WAV file
// (the server's speech-to-text turns it into words: lib/api.ts `voice.hear`). It works in every browser, in every language, and does not depend on the browser's own speech recognition,
// which is the part that fails most often (blocked service, wrong language, silent errors).
//
// How it decides: the microphone is read in slices of 20 ms. The room's noise level is followed all the time, and speech is "louder than the room by a clear margin for a moment";
// the sentence ends after a short silence. A little audio from just before the first loud slice is kept so the first syllable is never cut off.
// While the assistant is speaking the ear is paused (it would hear itself); `resume()` carries on, `pause()` throws away anything half heard.

export type EarError = 'mic-denied' | 'no-mic' | 'mic-lost' | 'mic-silent';
export interface EarOptions {
  deviceId?: string;
  onLevel: (v: number) => void;                       // 0..1, how loud it is now (moves the circle)
  onSpeaking: (on: boolean) => void;                  // somebody is speaking right now
  onUtterance: (wav: Blob, seconds: number) => void;  // one finished sentence
  onError: (e: EarError) => void;
}

const FRAME_MS = 20;
const PRE_ROLL_MS = 360;
const START_FRAMES = 3;                               // 60 ms of clearly louder sound = speech starts
const HANG_MS = 750;                                  // this much quiet = the sentence is over
const MIN_VOICED_MS = 220;                            // shorter than this is a click or a cough
const MAX_MS = 22000;
const TARGET_RATE = 16000;

const WORKLET = `
class Tap extends AudioWorkletProcessor {
  constructor() { super(); this.parts = []; this.n = 0; this.size = Math.round(sampleRate * ${FRAME_MS} / 1000); }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      this.parts.push(new Float32Array(ch)); this.n += ch.length;
      if (this.n >= this.size) {
        const out = new Float32Array(this.n); let o = 0;
        for (const p of this.parts) { out.set(p, o); o += p.length; }
        this.parts = []; this.n = 0; this.port.postMessage(out, [out.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('crp-ear-tap', Tap);
`;

export class Ear {
  private o: EarOptions;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioNode | null = null;
  private rate = 48000;
  private alive = false; private paused = false;
  private pre: Float32Array[] = []; private preN = 0;
  private cur: Float32Array[] = []; private curN = 0; private voicedN = 0;
  private speaking = false; private loud = 0; private quietN = 0;
  private noise = 0; private calib = 0; private ready = false; private hist: number[] = []; private tick = 0;
  private lastFrameAt = 0; private zeros = 0; private watchdog: ReturnType<typeof setInterval> | null = null;
  label = '';

  constructor(o: EarOptions) { this.o = o; }

  async start(): Promise<void> {
    if (this.alive) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: this.o.deviceId ? { exact: this.o.deviceId } : undefined, channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      const n = (e as DOMException).name;
      if (n === 'NotAllowedError' || n === 'SecurityError') this.o.onError('mic-denied');
      else if (n === 'OverconstrainedError' && this.o.deviceId) { this.o = { ...this.o, deviceId: undefined }; return this.start(); }   // the chosen microphone is gone: use the default one
      else this.o.onError('no-mic');
      return;
    }
    this.stream = stream; this.alive = true; this.label = stream.getAudioTracks()[0]?.label ?? '';
    stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (this.alive) this.o.onError('mic-lost'); });
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let src: MediaStreamAudioSourceNode;
    try {
      try { this.ctx = new AC({ sampleRate: TARGET_RATE }); src = this.ctx.createMediaStreamSource(stream); }              // listening at 16 kHz directly (Chrome / Edge)
      catch { try { this.ctx?.close(); } catch { /* none */ } this.ctx = new AC(); src = this.ctx.createMediaStreamSource(stream); }   // other browsers: the device's own rate, brought down to 16 kHz when a sentence is packed
    } catch { this.stop(); this.o.onError('no-mic'); return; }
    this.rate = this.ctx.sampleRate;
    await this.ctx.resume().catch(() => {});
    try {
      const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
      await this.ctx.audioWorklet.addModule(url); URL.revokeObjectURL(url);
      const n = new AudioWorkletNode(this.ctx, 'crp-ear-tap'); n.port.onmessage = (e) => this.frame(e.data as Float32Array);
      const mute = this.ctx.createGain(); mute.gain.value = 0; src.connect(n); n.connect(mute); mute.connect(this.ctx.destination); this.node = n;
    } catch {                                                  // very old browsers: the same job with the older node
      const sp = this.ctx.createScriptProcessor(1024, 1, 1); const mute = this.ctx.createGain(); mute.gain.value = 0;
      sp.onaudioprocess = (e) => this.frame(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(sp); sp.connect(mute); mute.connect(this.ctx.destination); this.node = sp;
    }
    this.lastFrameAt = Date.now();
    this.watchdog = setInterval(() => {
      if (!this.alive) return;
      if (Date.now() - this.lastFrameAt > 4000) { this.o.onError('mic-lost'); this.lastFrameAt = Date.now(); }
      if (this.zeros > 400) { this.zeros = 0; this.o.onError('mic-silent'); }          // 8 s of exact zeros: the microphone is muted (switch, privacy key)
    }, 1000);
  }

  stop() {
    this.alive = false; if (this.watchdog) clearInterval(this.watchdog); this.watchdog = null;
    try { this.node?.disconnect(); } catch { /* already gone */ }
    this.stream?.getTracks().forEach((t) => t.stop()); this.ctx?.close().catch(() => {});
    this.stream = null; this.ctx = null; this.node = null; this.reset(); this.o.onLevel(0);
  }

  pause() { this.paused = true; this.reset(); this.o.onLevel(0); }
  resume() { this.paused = false; this.reset(); }
  /** How loud the room is, and the level a voice has to pass (for the troubleshooting line). */
  get state() { return { noise: this.noise, threshold: this.on(), ready: this.ready }; }

  private reset() {
    this.cur = []; this.curN = 0; this.voicedN = 0; this.loud = 0; this.quietN = 0;
    if (this.speaking) { this.speaking = false; this.o.onSpeaking(false); }
  }
  private on() { return Math.max(0.009, this.noise * 3.2); }
  private off() { return Math.max(0.006, this.noise * 1.9); }

  private frame(f: Float32Array) {
    if (!this.alive) return;
    this.lastFrameAt = Date.now();
    let sum = 0, peak = 0; for (let i = 0; i < f.length; i++) { const v = f[i]; sum += v * v; if (Math.abs(v) > peak) peak = Math.abs(v); }
    const rms = Math.sqrt(sum / f.length);
    this.zeros = peak === 0 ? this.zeros + 1 : 0;
    this.o.onLevel(this.paused ? 0 : Math.min(1, rms / 0.1));
    if (this.paused) return;
    const ms = (f.length / this.rate) * 1000;

    if (!this.speaking) { this.hist.push(rms); if (this.hist.length > 150) this.hist.shift(); if (++this.tick % 5 === 0 || !this.ready) this.noise = quietest(this.hist); }
    if (!this.ready) { this.calib += ms; if (this.calib >= 300) this.ready = true; return; }          // the first 0.3 s only measures the room
    if (!this.speaking) {
      this.pre.push(f); this.preN += f.length;
      while (this.preN - this.pre[0].length > (PRE_ROLL_MS / 1000) * this.rate) { this.preN -= this.pre[0].length; this.pre.shift(); }
      if (rms > this.on()) {
        if (++this.loud >= START_FRAMES) {
          this.speaking = true; this.o.onSpeaking(true);
          this.cur = [...this.pre]; this.curN = this.preN; this.pre = []; this.preN = 0; this.voicedN = this.loud * ms; this.quietN = 0;
        }
      } else this.loud = 0;
      return;
    }
    this.cur.push(f); this.curN += f.length;
    if (rms > this.off()) { this.voicedN += ms; this.quietN = 0; } else this.quietN += ms;
    const length = (this.curN / this.rate) * 1000;
    if (this.quietN >= HANG_MS || length >= MAX_MS) this.finish(length);
  }

  private finish(lengthMs: number) {
    const frames = this.cur; const voiced = this.voicedN; this.reset();
    if (voiced < MIN_VOICED_MS || lengthMs < 420) return;
    const all = new Float32Array(frames.reduce((n, f) => n + f.length, 0)); let o = 0; for (const f of frames) { all.set(f, o); o += f.length; }
    this.o.onUtterance(toWav(all, this.rate), all.length / this.rate);
  }
}

/** The room's noise level: the quieter fifth of the last three seconds (speech, however long, does not move it much). */
function quietest(h: number[]): number {
  if (!h.length) return 0;
  const a = [...h].sort((x, y) => x - y); return Math.max(0.0015, a[Math.floor(a.length * 0.2)]);
}

/** Mono 16-bit WAV at 16 kHz (a quiet recording is brought up to a good level first). */
function toWav(samples: Float32Array, rate: number): Blob {
  let s = samples;
  if (rate !== TARGET_RATE) {                                    // average-and-pick down to 16 kHz
    const ratio = rate / TARGET_RATE; const n = Math.floor(s.length / ratio); const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const a = Math.floor(i * ratio); const b = Math.min(s.length, Math.floor((i + 1) * ratio)); let t = 0; for (let k = a; k < b; k++) t += s[k]; out[i] = t / Math.max(1, b - a); }
    s = out;
  }
  let peak = 0; for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; }
  const gain = peak > 0 && peak < 0.35 ? Math.min(6, 0.7 / peak) : 1;
  const buf = new ArrayBuffer(44 + s.length * 2); const v = new DataView(buf);
  const w = (o: number, t: string) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + s.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TARGET_RATE, true); v.setUint32(28, TARGET_RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, s.length * 2, true);
  for (let i = 0; i < s.length; i++) { const x = Math.max(-1, Math.min(1, s[i] * gain)); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

export async function listMicrophones(): Promise<{ id: string; label: string }[]> {
  try {
    const d = await navigator.mediaDevices.enumerateDevices();
    return d.filter((x) => x.kind === 'audioinput' && x.deviceId !== 'communications').map((x, i) => ({ id: x.deviceId, label: x.label || `Microphone ${i + 1}` }));
  } catch { return []; }
}
