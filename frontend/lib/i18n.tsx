'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en, { type Dict } from './lang/en';
import hi from './lang/hi';
import bn from './lang/bn';
import mr from './lang/mr';
import te from './lang/te';
import ta from './lang/ta';
import gu from './lang/gu';
import ur from './lang/ur';
import kn from './lang/kn';
import or from './lang/or';
import ml from './lang/ml';

export type Lang = 'en' | 'hi' | 'bn' | 'mr' | 'te' | 'ta' | 'gu' | 'ur' | 'kn' | 'or' | 'ml';

// Ordered by number of speakers in India. `native` is how the language names itself in the picker.
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

const DICTS: Record<Lang, Dict> = { en, hi, bn, mr, te, ta, gu, ur, kn, or, ml };

export type Key = keyof Dict;
type Vars = Record<string, string | number>;

interface Ctx {
  lang: Lang; setLang: (l: Lang) => void; dir: 'ltr' | 'rtl';
  t: (key: Key, vars?: Vars) => string;
  // Looks up `${prefix}_${code}`; returns `fallback` when the backend sends a code we have no text for (new category, new flag…).
  tx: (prefix: string, code: string, fallback: string, vars?: Vars) => string;
  date: (iso: string) => string;
  alert: (a: { type: string; days: number; message: string }) => string;
  fact: (text: string) => string;
}

const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

const LangCtx = createContext<Ctx>({
  lang: 'en', setLang: () => {}, dir: 'ltr',
  t: (k, v) => fill(en[k], v), tx: (p, c, f) => f, date: (d) => d, alert: (a) => a.message, fact: (x) => x,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    try { const l = localStorage.getItem('crp-lang') as Lang | null; if (l && DICTS[l]) setLangState(l); } catch { /* ignore */ }
  }, []);

  const info = LANGS.find((l) => l.code === lang)!;
  const dir = info.rtl ? 'rtl' : 'ltr';

  useEffect(() => {
    const r = document.documentElement;
    r.lang = lang; r.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('crp-lang', l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<Ctx>(() => {
    const d = DICTS[lang];
    const t = (key: Key, vars?: Vars) => fill(d[key] ?? en[key], vars);
    const tx = (prefix: string, code: string, fallback: string, vars?: Vars) => {
      const k = `${prefix}_${code}` as Key;
      const s = d[k] ?? en[k];
      return s ? fill(s, vars) : fallback;
    };
    // Western digits in every language, so numbers always match the English-only data.
    const date = (iso: string) => new Date(iso).toLocaleDateString(`${info.locale}-u-nu-latn`, { day: 'numeric', month: 'short', year: 'numeric' });
    // Alert wording is operating text; the action named after the colon comes from the data and stays in English.
    const alert = (a: { type: string; days: number; message: string }) => {
      if (a.type === 'deadline') {
        const action = a.message.split(': ').slice(1).join(': ');
        return t('alertOverdue', { n: a.days }) + (action ? `: \u2068${action}\u2069` : '');
      }
      if (a.type === 'visit') return t(a.message.startsWith('Never') ? 'alertNever' : 'alertNoVisit', { n: a.days });
      return a.message;
    };
    // The card's one-line summary is built by the engine in English; re-express its known sentence shapes, keep the numbers.
    const fact = (text: string) => {
      let m: RegExpMatchArray | null;
      if ((m = text.match(/^(\d+)% of (\d+) assessed students are below the benchmark/))) return t('fact_gap', { p: m[1], n: m[2] });
      if ((m = text.match(/^(\d+) unresolved issues?$/))) return t('fact_unresolved', { n: m[1] });
      if ((m = text.match(/^(\d+) follow-ups? overdue$/))) return t('fact_overdue', { n: m[1] });
      if ((m = text.match(/^Last visit (\d+) days ago/))) return t('fact_lastvisit', { n: m[1] });
      if (/^Never observed/.test(text)) return t('fact_never');
      if ((m = text.match(/^(.+?) was raised on (\d+) separate dates/))) return t('fact_recurring', { need: m[1], n: m[2] });
      return text;
    };
    return { lang, setLang, dir, t, tx, date, alert, fact };
  }, [lang, dir, info.locale, setLang]);

  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
