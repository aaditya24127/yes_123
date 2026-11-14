'use client';
// On the teacher's home page: "your mentor asked for a short assessment" with the Start Assessment button, or "your report is ready".
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileText } from 'lucide-react';
import { api, type Assessment } from '@/lib/api';
import { VoiceOrb } from '@/components/VoiceOrb';
import { useLang } from '@/lib/i18n';

export default function AssessmentCard({ className = '' }: { className?: string }) {
  const { tr } = useLang();
  const [list, setList] = useState<Assessment[]>([]);
  useEffect(() => {
    let off = false;
    const load = () => { api.assessments().then((x) => { if (!off) setList(x); }).catch(() => undefined); };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => { off = true; clearInterval(id); };
  }, []);
  const open = list.find((a) => a.status === 'ready' || a.status === 'in_progress' || a.status === 'submitted');
  const fresh = list.find((a) => a.status === 'reported' && Date.now() - new Date(a.requested_at).getTime() < 30 * 86400000 && !open);
  const a = open ?? fresh;
  if (!a) return null;
  const ready = a.status === 'ready' || a.status === 'in_progress';
  return (
    <Link href={`/assessment?id=${a.id}`} className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl bg-brand-700 p-4 text-white shadow-float transition hover:bg-brand-800 ${className}`}>
      <div className="shrink-0"><VoiceOrb state={ready ? 'idle' : 'thinking'} size={64} caption={false} /></div>
      <div className="min-w-[11rem] flex-1">
        <p className="font-semibold leading-snug">{ready ? (a.status === 'in_progress' ? tr('Continue your assessment') : tr('Your mentor asked for a short assessment')) : a.status === 'submitted' ? tr('Your report is being written') : tr('Your assessment report is ready')}</p>
        <p className="line-clamp-2 text-sm text-brand-100">{tr(a.subject)}{a.class_no ? tr(', Class {class_no}', { class_no: a.class_no }) : ''}: {tr(a.chapter)}</p>
      </div>
      <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 sm:w-auto">
        {ready ? <>{tr('Start Assessment')}<ArrowRight size={15} /></> : <><FileText size={15} />{tr('Open report')}</>}
      </span>
    </Link>
  );
}
