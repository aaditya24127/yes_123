'use client';
// Drag-and-drop (or click) area for many files at once, including .zip.
import { useRef, useState } from 'react';
import { UploadCloud } from 'lucide-react';

export default function FileDrop({ onFiles, accept, multiple = true, title, hint, compact }: {
  onFiles: (files: File[]) => void; accept?: string; multiple?: boolean; title: string; hint?: string; compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | null) => { if (list && list.length) onFiles(Array.from(list)); };
  return (
    <div onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); }} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && ref.current?.click()}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed text-center transition ${compact ? 'px-4 py-5' : 'px-4 py-8 sm:px-6 sm:py-12'} ${over ? 'border-brand-500 bg-brand-50' : 'border-brand-200 bg-surface hover:border-brand-400 hover:bg-brand-50/50'}`}>
      <UploadCloud size={compact ? 24 : 36} className="text-brand-500" />
      <p className="font-semibold text-ink-900">{title}</p>
      {hint && <p className="max-w-xl text-sm text-ink-500">{hint}</p>}
      <input ref={ref} type="file" multiple={multiple} accept={accept} className="hidden" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
