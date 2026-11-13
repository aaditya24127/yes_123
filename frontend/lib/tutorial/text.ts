'use client';
// The tutorial's words for the chosen language. English is always loaded (and fills any gap); another language is fetched when needed.
import { useEffect, useState } from 'react';
import en from './lang/en.json';
import type { Lang } from '@/lib/i18n';

export interface Line { t: string; v: string }             // t = shown on screen, v = spoken
export interface TutorialText { ui: Record<string, string>; chapters: Record<string, string>; steps: Record<string, Line> }

const EN = en as TutorialText;
const cache: Partial<Record<Lang, TutorialText>> = { en: EN };

async function load(lang: Lang): Promise<TutorialText> {
  if (cache[lang]) return cache[lang]!;
  try {
    const mod = await import(`./lang/${lang}.json`);
    const d = (mod.default ?? mod) as Partial<TutorialText>;
    cache[lang] = { ui: { ...EN.ui, ...d.ui }, chapters: { ...EN.chapters, ...d.chapters }, steps: { ...EN.steps, ...d.steps } };
  } catch { cache[lang] = EN; }
  return cache[lang]!;
}

/** Words for `lang`; English until the language has arrived. `own` tells whether a step has its own words in that language. */
export function useTutorialText(lang: Lang): TutorialText & { ready: boolean } {
  const [got, setGot] = useState<{ lang: Lang; text: TutorialText } | null>(cache[lang] ? { lang, text: cache[lang]! } : null);
  useEffect(() => { let live = true; load(lang).then((text) => live && setGot({ lang, text })); return () => { live = false; }; }, [lang]);
  // `ready` is false for the moment a language is still arriving, so the guide never shows (or speaks) the wrong language.
  const ready = got?.lang === lang;
  return { ...(ready ? got!.text : EN), ready };
}
