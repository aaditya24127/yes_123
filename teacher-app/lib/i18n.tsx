'use client';
// Screen language of the teacher app (same idea as the CRP website's lib/i18n.tsx): the English phrase is the key,
// lib/lang/ui/<code>.json holds the translation (made by tools/i18n/translate.py). A phrase without a translation shows in English,
// and data from the server (names, notes, chapter names) is never translated.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'hi' | 'bn' | 'mr' | 'te' | 'ta' | 'gu' | 'ur' | 'kn' | 'or' | 'ml';

export const LANGS: { code: Lang; native: string; english: string; locale: string; rtl?: boolean }[] = [
  { code: 'en', native: 'English', english: 'English', locale: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', locale: 'hi-IN' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', locale: 'bn-IN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', locale: 'mr-IN' },
  { code: 'te', native: 'తెలుగు', english: 'Telugu', locale: 'te-IN' },
  { code: 'ta', native: 'தமிழ்', english: 'Tamil', locale: 'ta-IN' },
  { code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', locale: 'gu-IN' },
  { code: 'ur', native: 'اردو', english: 'Urdu', locale: 'ur-IN', rtl: true },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', locale: 'kn-IN' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', locale: 'or-IN' },
  { code: 'ml', native: 'മലയാളം', english: 'Malayalam', locale: 'ml-IN' },
];

type Vars = Record<string, string | number>;
interface Ctx {
  lang: Lang; setLang: (l: Lang) => void; dir: 'ltr' | 'rtl';
  tr: <T extends string | null | undefined>(text: T, vars?: Vars) => T extends string ? string : T;
  date: (iso: string) => string;
  // A notice or message written by the server: known sentence shapes are translated, anything the CRP typed stays as it is.
  tn: (text: string | null | undefined) => string;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);
const LangCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, dir: 'ltr', tr: (s, v) => (s == null ? s : fill(s, v)) as never, date: (d) => d, tn: (s) => s ?? '' });

const UI: Partial<Record<Lang, Record<string, string>>> = {};
async function loadUi(lang: Lang): Promise<Record<string, string>> {
  if (lang === 'en') return {};
  if (UI[lang]) return UI[lang]!;
  try { const m = await import(`./lang/ui/${lang}.json`); UI[lang] = (m.default ?? m) as Record<string, string>; } catch { UI[lang] = {}; }
  return UI[lang]!;
}

// For helpers that are not components (dates, "5 min ago"): the translator and locale of the language chosen right now.
let NOW: { tr: (s: string, v?: Vars) => string; locale: string } = { tr: (s, v) => fill(s, v), locale: 'en-IN' };
export const trNow = (s: string, v?: Vars) => NOW.tr(s, v);
export const localeNow = () => NOW.locale;

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [ui, setUi] = useState<{ lang: Lang; words: Record<string, string> }>({ lang: 'en', words: {} });

  useEffect(() => {
    try { const l = localStorage.getItem('crp-lang') as Lang | null; if (l && LANGS.some((x) => x.code === l)) setLangState(l); } catch { /* ignore */ }
  }, []);

  const info = LANGS.find((l) => l.code === lang)!;
  const dir = info.rtl ? 'rtl' : 'ltr';
  useEffect(() => { const r = document.documentElement; r.lang = lang; r.dir = dir; }, [lang, dir]);
  useEffect(() => { let live = true; loadUi(lang).then((words) => { if (live) setUi({ lang, words }); }); return () => { live = false; }; }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('crp-lang', l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<Ctx>(() => {
    const words = ui.lang === lang ? ui.words : {};         // never English words under another language's name while it loads
    const tr = <T extends string | null | undefined>(text: T, vars?: Vars) => (text == null ? text : fill(words[text] ?? text, vars)) as T extends string ? string : T;
    // Western digits in every language, so numbers always match the English-only data.
    const date = (iso: string) => new Date(iso).toLocaleDateString(`${info.locale}-u-nu-latn`, { day: 'numeric', month: 'short', year: 'numeric' });
    const label = (l: string) => { const m = l.match(/^Task (\d+)$/); return m ? tr('Task {n}', { n: m[1] }) : tr(l); };
    const tn = (text: string | null | undefined) => {
      if (!text) return '';
      let m: RegExpMatchArray | null;
      if ((m = text.match(/^(.+?) (accepted|needs changes): (.*)$/))) return tr(`{label} ${m[2]}: {title}`, { label: label(m[1]), title: m[3] });
      if ((m = text.match(/^Thank you: '(.*)' was accepted$/))) return tr("Thank you: '{title}' was accepted", { title: m[1] });
      if ((m = text.match(/^(.+?): (.+)\. Tap to start\.$/))) return tr('{subject}: {chapter}. Tap to start.', { subject: tr(m[1]), chapter: m[2] });
      if ((m = text.match(/^(.+?), Class (\d*): (.+)\. Open the app and tap Start assessment\.$/))) return tr('{subject}, Class {class_no}: {chapter}. Open the app and tap Start assessment.', { subject: tr(m[1]), class_no: m[2], chapter: m[3] });
      return tr(text);
    };
    NOW = { tr: tr as (s: string, v?: Vars) => string, locale: `${info.locale}-u-nu-latn` };
    return { lang, setLang, dir, tr, date, tn };
  }, [lang, dir, info.locale, setLang, ui]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
