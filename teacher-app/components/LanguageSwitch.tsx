'use client';
// Language chooser: a round globe button on phones, with the language name on wider screens. It is a real <select> laid over the button,
// so the phone's own picker opens (large, easy to use, works with a keyboard and screen readers).
import { Globe } from 'lucide-react';
import { LANGS, useLang, type Lang } from '@/lib/i18n';

export default function LanguageSwitch({ className = '', onDark = false }: { className?: string; onDark?: boolean }) {
  const { lang, setLang, tr } = useLang();
  const cur = LANGS.find((l) => l.code === lang)!;
  const look = onDark ? 'bg-white/15 text-white ring-white/30' : 'bg-surface text-brand-700 ring-brand-100 shadow-float';
  return (
    <label className={`relative inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold ring-1 ${look} ${className}`} title={tr('Language')}>
      <Globe size={18} aria-hidden />
      <span className="hidden sm:inline" lang={lang}>{tr(cur.native)}</span>
      <select value={lang} onChange={(e) => setLang(e.target.value as Lang)} aria-label={tr('Language')}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-full bg-transparent text-transparent opacity-0">
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code} className="text-ink-900">{tr(l.native)} · {tr(l.english)}</option>)}
      </select>
    </label>
  );
}
