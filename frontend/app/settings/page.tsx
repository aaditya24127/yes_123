'use client';
// Settings the way any app has them: how it looks, which language, and logging out. Nothing technical.
import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowUpDown, Check, LayoutGrid, LogOut } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import { Button, Card } from '@/components/ui';
import { LANGS, useLang } from '@/lib/i18n';
import { LANDING_URL } from '@/lib/platform';
import { DEFAULT_THEME, THEMES, loadTheme, saveTheme } from '@/lib/theme';

type Layout = 'grid' | 'vertical' | 'horizontal';
const LAYOUTS: { key: Layout; label: string; text: string; Icon: typeof LayoutGrid }[] = [
  { key: 'grid', label: 'Cards', text: 'Many cards on the screen', Icon: LayoutGrid },
  { key: 'vertical', label: 'One by one', text: 'Scroll up and down', Icon: ArrowUpDown },
  { key: 'horizontal', label: 'Sideways', text: 'Swipe left and right', Icon: ArrowLeftRight },
];

export default function SettingsPage() {
  const { lang, setLang } = useLang();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [layout, setLayout] = useState<Layout>('grid');
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    setTheme(loadTheme());
    try { const u = localStorage.getItem('crp-ui'); if (u === 'vertical' || u === 'horizontal') setLayout(u); } catch { /* ignore */ }
  }, []);
  const pickLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem('crp-ui', l); } catch { /* ignore */ } };
  const pickTheme = (i: number) => { setTheme(i); saveTheme(i); };

  return (
    <PageShell title="Settings" subtitle="Choose how the app looks and which language it speaks.">
      <Card title="Colours" subtitle="Pick the colours you like. The change is saved on this device.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {THEMES.map((t, i) => (
            <button key={t.name} onClick={() => pickTheme(i)} aria-pressed={theme === i}
              className={`flex items-center gap-3 rounded-2xl p-3 text-start ring-1 transition ${theme === i ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-surface ring-brand-100 hover:ring-brand-300'}`}>
              <span className="flex shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">{[t.brand[3], t.brand[6], t.brand[8], t.page].map((c) => <span key={c} className="h-9 w-4" style={{ background: c }} />)}</span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">{t.name}</span>
              {theme === i && <Check size={16} className="shrink-0 text-brand-700" />}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Layout of your priority list" subtitle="How the schools and teachers are shown on the first page.">
        <div className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map(({ key, label, text, Icon }) => (
            <button key={key} onClick={() => pickLayout(key)} aria-pressed={layout === key}
              className={`flex items-center gap-3 rounded-2xl p-3 text-start ring-1 transition ${layout === key ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-surface ring-brand-100 hover:ring-brand-300'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${layout === key ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}><Icon size={19} /></span>
              <span><b className="block text-sm text-ink-900">{label}</b><span className="text-xs text-ink-500">{text}</span></span>
            </button>
          ))}
        </div>
      </Card>

      <Card title="Language" subtitle="Menus and buttons change to your language. Names and records stay as they are.">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} lang={l.code} aria-pressed={lang === l.code}
              className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-start transition ${lang === l.code ? 'bg-brand-600 text-white shadow-float' : 'bg-brand-50/60 text-ink-900 hover:bg-brand-100'}`}>
              <span className="min-w-0"><span className="block truncate text-[15px] font-semibold">{l.native}</span>
                <span className={`block text-[11px] ${lang === l.code ? 'text-white/80' : 'text-ink-500'}`} lang="en">{l.english}</span></span>
              {lang === l.code && <Check size={16} className="shrink-0" />}
            </button>
          ))}
        </div>
      </Card>

      <Card title="Account">
        {!leaving ? <Button variant="danger" icon={<LogOut size={16} />} onClick={() => setLeaving(true)}>Log out</Button> : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-700">Leave the app and go back to the start page?</span>
            <Button variant="danger" icon={<LogOut size={16} />} onClick={() => { window.location.href = LANDING_URL; }}>Yes, log out</Button>
            <Button variant="ghost" onClick={() => setLeaving(false)}>Stay</Button>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
