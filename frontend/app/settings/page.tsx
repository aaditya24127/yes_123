'use client';
// Settings the way any app has them: how it looks, which language, and logging out. Nothing technical.
import { useEffect, useState } from 'react';
import { ArrowLeftRight, ArrowUpDown, Check, LayoutGrid, LogOut } from 'lucide-react';
import PageShell from '@/components/shell/PageShell';
import { Button, Card, Input } from '@/components/ui';
import { LANGS, useLang } from '@/lib/i18n';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { AIUsage } from '@/lib/types';
import { session, useUser } from '@/lib/auth';
import { DEFAULT_THEME, THEMES, loadTheme, saveTheme } from '@/lib/theme';

type Layout = 'grid' | 'vertical' | 'horizontal';
const LAYOUTS: { key: Layout; label: string; text: string; Icon: typeof LayoutGrid }[] = [
  { key: 'grid', label: 'Cards', text: 'Many cards on the screen', Icon: LayoutGrid },
  { key: 'vertical', label: 'One by one', text: 'Scroll up and down', Icon: ArrowUpDown },
  { key: 'horizontal', label: 'Sideways', text: 'Swipe left and right', Icon: ArrowLeftRight },
];

/** TEMPORARY: what each AI key has used. The app counts every call it makes; type the credit you loaded on a key to see what is left of it. */
function AICredits() {
  const { tr } = useLang();
  const [u, setU] = useState<AIUsage | null>(null);
  const [err, setErr] = useState('');
  const [loaded, setLoaded] = useState<Record<string, string>>({});
  useEffect(() => {
    api.ai.usage(30).then(setU).catch((e) => setErr(String(e.message || e)));
    try { setLoaded(JSON.parse(localStorage.getItem('crp_ai_credits') ?? '{}')); } catch { /* private window */ }
  }, []);
  const save = (id: string, v: string) => setLoaded((m) => { const n = { ...m, [id]: v }; try { localStorage.setItem('crp_ai_credits', JSON.stringify(n)); } catch { /* private window */ } return n; });
  const money = (x: number) => `$${x.toFixed(x < 1 ? 4 : 2)}`;
  const num = (x: number) => x.toLocaleString('en-IN');
  return (
    <Card title={tr('AI credits by key')} subtitle={tr('Temporary. What each AI key has used so far.')}>
      {err ? <p className="text-sm text-red-700">{tr(err)}</p> : !u ? <p className="text-sm text-ink-500">{tr('Loading…')}</p> : (
        <>
          <ul className="grid gap-3 lg:grid-cols-3">
            {u.by_key.map((k) => {
              const have = parseFloat(loaded[k.id] ?? ''); const ok = Number.isFinite(have);
              return (
                <li key={k.id} className="rounded-2xl bg-brand-50/60 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-ink-900">{tr(k.label)}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${k.key_set ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{k.key_set ? tr('Key connected') : tr('No key')}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">{tr(k.note)}</p>
                  <p className="mt-2 text-xs font-semibold text-ink-500">{tr('Used so far')}</p>
                  <p className="font-serif text-2xl font-semibold text-ink-900">{k.plan === 'free' && k.cost_usd === 0 ? tr('Free') : money(k.cost_usd)}</p>
                  <p className="text-xs text-ink-500">{k.failed ? tr('{calls} calls, {failed} failed · last 30 days: {recent}', { calls: num(k.calls), failed: k.failed, recent: num(k.calls_recent) }) : tr('{calls} calls · last 30 days: {recent}', { calls: num(k.calls), recent: num(k.calls_recent) })}</p>
                  {(k.tokens_in > 0 || k.tokens_out > 0) && <p className="text-xs text-ink-500">{tr('{num} tokens in · {num2} tokens out', { num: num(k.tokens_in), num2: num(k.tokens_out) })}</p>}
                  <label className="mt-2 block text-xs font-semibold text-ink-700"><span className="block">{tr('Credit you loaded on this key ($)')}</span>
                    <Input className="mt-1" inputMode="decimal" placeholder={tr('for example 20')} value={loaded[k.id] ?? ''} onChange={(e) => save(k.id, e.target.value)} /></label>
                  {ok && <p className="mt-2 text-sm text-ink-700">{tr('Left: {left} of {total}', { left: money(Math.max(0, have - k.cost_usd)), total: money(have) })}</p>}
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-500">{tr('The app adds up the cost of every AI call it makes, so the amounts are an estimate. It cannot read the balance on your AI accounts: type the credit you loaded on each key to see what is left. The exact balance is on each account\'s billing page.')}</p>
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { lang, setLang , tr } = useLang();
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [layout, setLayout] = useState<Layout>('grid');
  const [leaving, setLeaving] = useState(false);
  const router = useRouter();
  const user = useUser();
  // Signing out forgets the sign-in on this device (and the cookie used for opening files), then shows the sign-in page.
  const logOut = async () => { try { await api.auth.logout(); } catch { /* signing out here is enough */ } session.clear(); router.replace('/login'); };
  useEffect(() => {
    setTheme(loadTheme());
    try { const u = localStorage.getItem('crp-ui'); if (u === 'vertical' || u === 'horizontal') setLayout(u); } catch { /* ignore */ }
  }, []);
  const pickLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem('crp-ui', l); } catch { /* ignore */ } };
  const pickTheme = (i: number) => { setTheme(i); saveTheme(i); };

  return (
    <PageShell title={tr('Settings')} subtitle={tr('Choose how the app looks and which language it speaks.')}>
      <Card tour="s-colours" title={tr('Colours')} subtitle={tr('Pick the colours you like. The change is saved on this device.')}>
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {THEMES.map((t, i) => (
            <button key={t.name} onClick={() => pickTheme(i)} aria-pressed={theme === i}
              className={`flex flex-col items-start gap-2 rounded-2xl p-3 text-start ring-1 transition sm:flex-row sm:items-center sm:gap-3 ${theme === i ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-surface ring-brand-100 hover:ring-brand-300'}`}>
              <span className="flex shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">{[t.brand[3], t.brand[6], t.brand[8], t.page].map((c) => <span key={c} className="h-9 w-4" style={{ background: c }} />)}</span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">{tr(t.name)}</span>
              {theme === i && <Check size={16} className="shrink-0 text-brand-700" />}
            </button>
          ))}
        </div>
      </Card>

      <Card className="hidden md:block" title={tr('Layout of your priority list')} subtitle={tr('How the schools and teachers are shown on the first page (wide screens).')}>
        <div className="grid gap-3 sm:grid-cols-3">
          {LAYOUTS.map(({ key, label, text, Icon }) => (
            <button key={key} onClick={() => pickLayout(key)} aria-pressed={layout === key}
              className={`flex items-center gap-3 rounded-2xl p-3 text-start ring-1 transition ${layout === key ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-surface ring-brand-100 hover:ring-brand-300'}`}>
              <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${layout === key ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700'}`}><Icon size={19} /></span>
              <span><b className="block text-sm text-ink-900">{tr(label)}</b><span className="text-xs text-ink-500">{tr(text)}</span></span>
            </button>
          ))}
        </div>
      </Card>

      <Card tour="s-language" title={tr('Language')} subtitle={tr('Menus and buttons change to your language. Names and records stay as they are.')}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code)} lang={l.code} aria-pressed={lang === l.code}
              className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-start transition ${lang === l.code ? 'bg-brand-600 text-white shadow-float' : 'bg-brand-50/60 text-ink-900 hover:bg-brand-100'}`}>
              <span className="min-w-0"><span className="block truncate text-[15px] font-semibold">{tr(l.native)}</span>
                <span className={`block text-[11px] ${lang === l.code ? 'text-white/80' : 'text-ink-500'}`} lang="en">{tr(l.english)}</span></span>
              {lang === l.code && <Check size={16} className="shrink-0" />}
            </button>
          ))}
        </div>
      </Card>

      <AICredits />

      <Card tour="s-account" title={tr('Account')}>
        {user && (
          <p className="mb-3 text-sm text-ink-700">{tr('Signed in as')}{' '}<b className="text-ink-900">{user.title ? `${user.title} ` : ''}{tr(user.name)}</b> <span className="text-ink-500">({tr(user.email)})</span>
            {user.is_demo && <span className="ms-2 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">{tr('Demo account')}</span>}</p>
        )}
        {!leaving ? <Button variant="danger" icon={<LogOut size={16} />} onClick={() => setLeaving(true)}>{tr('Log out')}</Button> : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-700">{tr('Sign out of the app on this device?')}</span>
            <Button variant="danger" icon={<LogOut size={16} />} onClick={logOut}>{tr('Yes, log out')}</Button>
            <Button variant="ghost" onClick={() => setLeaving(false)}>{tr('Stay')}</Button>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
