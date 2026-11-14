'use client';
// Records from the phone / laptop microphone in the browser, or lets the CRP pick an existing audio file instead.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { Button } from './index';
import { useLang } from '@/lib/i18n';

function fmt(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

export default function AudioRecorder({ onDone, label = 'Record', busy, small, checkSound }: { onDone: (blob: Blob, name: string) => void; label?: string; busy?: boolean; small?: boolean; checkSound?: boolean }) {
  const { tr } = useLang();
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const chunks = useRef<Blob[]>([]);
  const peak = useRef(0);                                 // loudest moment heard while recording (0 to 1)
  const [level, setLevel] = useState(0);
  const stopMeter = useRef<() => void>(() => {});
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [rec]);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      peak.current = 0; setLevel(0);
      try {                                                    // a small live bar, so the person can see the microphone is hearing them
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx(); const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize); let live = true;
        const tick = () => { if (!live) return; an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128) / 128); peak.current = Math.max(peak.current, m); setLevel(m); requestAnimationFrame(tick); };
        tick(); stopMeter.current = () => { live = false; ctx.close().catch(() => {}); setLevel(0); };
      } catch { stopMeter.current = () => {}; }
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stopMeter.current();
        stream.getTracks().forEach((t) => t.stop());
        if (checkSound && peak.current < 0.03) { setErr(tr('We could not hear any sound. Check that the microphone is allowed and on, speak close to it, and try again.')); return; }
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const ext = (r.mimeType || '').includes('mp4') ? 'm4a' : (r.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
        onDone(blob, `recording_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`);
      };
      r.start(1000); setSecs(0); setRec(r);
    } catch {
      setErr(tr('Microphone not available. Allow microphone access, or upload a recording instead.'));
    }
  };
  const stop = () => { rec?.stop(); setRec(null); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!rec ? (
        <Button onClick={start} busy={busy} icon={<Mic size={16} />} className={small ? 'px-3 py-1.5' : ''}>{tr(label)}</Button>
      ) : (
        <Button onClick={stop} variant="danger" icon={<Square size={14} />} className={small ? 'px-3 py-1.5' : ''}>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />{tr('Stop')}{' '}{fmt(secs)}<span className="h-1.5 w-10 overflow-hidden rounded-full bg-red-200" aria-hidden><span className="block h-full bg-red-500 transition-[width]" style={{ width: `${Math.min(100, Math.round(level * 260))}%` }} /></span></span>
        </Button>
      )}
      {!rec && (
        <Button variant="soft" onClick={() => file.current?.click()} icon={<Upload size={15} />} className={small ? 'px-3 py-1.5' : ''}>{tr('Upload audio')}</Button>
      )}
      <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onDone(f, f.name); e.target.value = ''; }} />
      {err && <span className="text-xs text-red-600">{tr(err)}</span>}
    </div>
  );
}
