'use client';
// Records from the phone / laptop microphone in the browser, or lets the CRP pick an existing audio file instead.
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { Button } from './index';

function fmt(s: number) { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }

export default function AudioRecorder({ onDone, label = 'Record', busy, small }: { onDone: (blob: Blob, name: string) => void; label?: string; busy?: boolean; small?: boolean }) {
  const [rec, setRec] = useState<MediaRecorder | null>(null);
  const [secs, setSecs] = useState(0);
  const [err, setErr] = useState('');
  const chunks = useRef<Blob[]>([]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!rec) return; const t = setInterval(() => setSecs((s) => s + 1), 1000); return () => clearInterval(t); }, [rec]);

  const start = async () => {
    setErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
      const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      chunks.current = [];
      r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
        const ext = (r.mimeType || '').includes('mp4') ? 'm4a' : (r.mimeType || '').includes('ogg') ? 'ogg' : 'webm';
        onDone(blob, `recording_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.${ext}`);
      };
      r.start(1000); setSecs(0); setRec(r);
    } catch {
      setErr('Microphone not available. Allow microphone access, or upload a recording instead.');
    }
  };
  const stop = () => { rec?.stop(); setRec(null); };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!rec ? (
        <Button onClick={start} busy={busy} icon={<Mic size={16} />} className={small ? 'px-3 py-1.5' : ''}>{label}</Button>
      ) : (
        <Button onClick={stop} variant="danger" icon={<Square size={14} />} className={small ? 'px-3 py-1.5' : ''}>
          <span className="inline-flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />Stop {fmt(secs)}</span>
        </Button>
      )}
      {!rec && (
        <Button variant="soft" onClick={() => file.current?.click()} icon={<Upload size={15} />} className={small ? 'px-3 py-1.5' : ''}>Upload audio</Button>
      )}
      <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onDone(f, f.name); e.target.value = ''; }} />
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
