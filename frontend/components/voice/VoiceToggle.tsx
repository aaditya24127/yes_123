'use client';
// "Voice mode" switch in the top corner of every page. On: the assistant greets, listens and the circle appears at the bottom right. Alt + V does the same from the keyboard.
import { Mic } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { toggle } from '@/lib/voice/engine';
import { useVoice } from '@/lib/voice/store';

export default function VoiceToggle({ label = false }: { label?: boolean }) {
  const { tr } = useLang();
  const v = useVoice();
  const name = v.on ? tr('Turn voice mode off') : tr('Turn voice mode on');
  return (
    <button data-tour="voice-toggle" onClick={() => void toggle()} aria-pressed={v.on} aria-label={`${name} (Alt+V)`} title={`${name} (Alt+V)`}
      className={`relative flex h-12 shrink-0 items-center justify-center gap-2 rounded-full shadow-float ring-1 ring-brand-100 transition ${label ? 'w-12 lg:w-auto lg:px-4' : 'w-12'} ${v.on ? 'bg-brand-600 text-white' : 'bg-surface text-brand-600 hover:text-brand-800'}`}>
      <Mic size={21} />{label && <span className="hidden text-sm font-semibold lg:inline">{tr('Voice mode')}</span>}
      {v.on && <span aria-hidden className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-amber-400 ring-2 ring-white" />}
    </button>
  );
}
