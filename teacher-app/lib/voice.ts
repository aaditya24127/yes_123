// Free voice in the browser: the app reads a question aloud with the device's own voices (speechSynthesis), and records the answer with the microphone (MediaRecorder).
// The recording is sent to the server, turned into words there and thrown away. Nothing here costs anything.

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canRecord = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined';

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
function voices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  if (!voicesReady) {
    voicesReady = new Promise((resolve) => {
      const have = speechSynthesis.getVoices();
      if (have.length) return resolve(have);
      const done = () => resolve(speechSynthesis.getVoices());
      speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1500);                       // some phones never fire the event
    });
  }
  return voicesReady;
}

/** The best English voice on this device: Indian English first, then any English; female voices first (they read clearly on small speakers). */
async function pickVoice(): Promise<SpeechSynthesisVoice | null> {
  const all = await voices();
  const score = (v: SpeechSynthesisVoice) => {
    const l = v.lang.toLowerCase().replace('_', '-'); const n = v.name.toLowerCase();
    return (l === 'en-in' ? 40 : l.startsWith('en-in') ? 38 : l.startsWith('en-gb') ? 20 : l.startsWith('en') ? 15 : 0)
      + (/neerja|heera|veena|raveena|female|natural|online/.test(n) ? 8 : 0) + (v.localService ? 0 : 2) - (/espeak/.test(n) ? 10 : 0);
  };
  return [...all].filter((v) => v.lang.toLowerCase().startsWith('en')).sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Call this straight inside a tap handler (before any waiting): iPhones only let speech start if it was unlocked by a tap, and the first question is read after a network call. */
export function primeSpeech() {
  if (!canSpeak()) return;
  try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* not supported: reading aloud is skipped */ }
}

let current = 0;
/** Read `text` aloud. Resolves when it has been read (or was cancelled, or the device cannot speak). Long text is read sentence by sentence (some browsers stop after about 15 seconds). */
export async function speak(text: string, opts: { rate?: number } = {}): Promise<void> {
  if (!canSpeak()) return;
  const id = ++current;
  speechSynthesis.cancel();
  const voice = await pickVoice();
  const parts = text.match(/[^.?!]+[.?!]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  for (const part of parts) {
    if (id !== current) return;
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(part);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-IN';
      u.rate = opts.rate ?? 0.95; u.pitch = 1;
      u.onend = () => resolve(); u.onerror = () => resolve();
      speechSynthesis.speak(u);
      setTimeout(resolve, 20000 + part.length * 90);   // never wait forever if the device stays silent
    });
  }
}
export function stopSpeaking() { current++; if (canSpeak()) speechSynthesis.cancel(); }

export interface Recorder { stop: () => Promise<{ blob: Blob; heard: boolean; seconds: number }>; cancel: () => void }

/** Start the microphone. `onLevel` gets a number from 0 to 1 about every frame (the glowing circle follows it). */
export async function startRecorder(onLevel: (v: number) => void): Promise<Recorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.start(500);
  const t0 = Date.now();

  let ctx: AudioContext | null = null; let raf = 0; let loud = 0;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      if (rms > 0.02) loud++;
      onLevel(Math.min(1, rms * 5));
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch { /* no level meter on this device: recording still works */ }

  const release = () => { cancelAnimationFrame(raf); onLevel(0); stream.getTracks().forEach((t) => t.stop()); ctx?.close().catch(() => undefined); };
  return {
    stop: () => new Promise((resolve) => {
      rec.onstop = () => { release(); resolve({ blob: new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), heard: loud >= 10 || !ctx, seconds: (Date.now() - t0) / 1000 }); };
      if (rec.state !== 'inactive') rec.stop(); else rec.onstop?.(new Event('stop'));
    }),
    cancel: () => { rec.onstop = null; try { if (rec.state !== 'inactive') rec.stop(); } catch { /* already stopped */ } release(); },
  };
}
