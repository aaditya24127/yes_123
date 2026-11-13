'use client';
// The switch for the tutorial (top of every page). On = the guide walks through the app; off = the app as usual.
import { GraduationCap } from 'lucide-react';
import { useLang } from '@/lib/i18n';
import { tutorial, useTutorial } from '@/lib/tutorial/store';
import { useTutorialText } from '@/lib/tutorial/text';

export default function TutorialToggle({ label = false }: { label?: boolean }) {
  const st = useTutorial();
  const { lang } = useLang();
  const name = useTutorialText(lang).ui.toggle;
  return (
    <button data-tour="tutorial-toggle" onClick={() => (st.on ? tutorial.stop() : tutorial.start())} aria-pressed={st.on} aria-label={name} title={name}
      className={`flex h-12 shrink-0 items-center justify-center gap-2 rounded-full shadow-float ring-1 ring-brand-100 transition ${label ? 'px-4' : 'w-12'} ${st.on ? 'bg-brand-600 text-white' : 'bg-surface text-brand-600 hover:text-brand-800'}`}>
      <GraduationCap size={21} />{label && <span className="hidden text-sm font-semibold sm:inline">{name}</span>}
    </button>
  );
}
