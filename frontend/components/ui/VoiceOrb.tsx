'use client';
// The glowing circle that shows what the assistant is doing, in the colours of the chosen theme (CSS variables --b*):
//   idle = ready and waiting | listening = the person is speaking (the circle follows their voice) | thinking = working on the answer | speaking = reading aloud.
// The look is in globals.css (.orb*). The same file is used in teacher-app/components/VoiceOrb.tsx: keep the two in step.
import type { CSSProperties } from 'react';
import { useLang } from '@/lib/i18n';

export type OrbState = 'idle' | 'listening' | 'thinking' | 'speaking';
const WORD: Record<OrbState, string> = { idle: 'Ready', listening: 'Listening', thinking: 'Thinking', speaking: 'Speaking' };

export function VoiceOrb({ state, level = 0, size = 168, caption = true, word }: { state: OrbState; level?: number; size?: number; caption?: boolean; word?: string }) {
  const { tr } = useLang();
  const shown = word ?? WORD[state];
  const style = { '--s': `${size}px`, '--lvl': Math.max(0, Math.min(1, level)).toFixed(3) } as CSSProperties;
  return (
    <div className="flex flex-col items-center gap-3" role="img" aria-label={tr('The assistant is {x}', { x: shown.toLowerCase() })}>
      <div className={`orb orb-${state}`} style={style}>
        <span className="orb-glow" />
        <span className="orb-ring" />
        <span className="orb-ring r2" />
        <span className="orb-core"><span className="orb-swirl" /><span className="orb-liquid" /><span className="orb-shine" /></span>
      </div>
      {caption && <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">{tr(shown)}</p>}
    </div>
  );
}
