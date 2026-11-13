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

/** TEMPORARY: how much paid AI credit the app has used. The app counts every call it makes; the balance on your AI account is the real one. */
function AICredits() {
  const [u, setU] = useState<AIUsage | null>(null);
  const [err, setErr] = useState('');
  const [start, setStart] = useState('');
  useEffect(() => { api.ai.usage(30).then(setU).catch((e) => setErr(String(e.message || e))); try { setStart(localStorage.getItem('crp_ai_credit') ?? ''); } catch { /* private window */ } }, []);
  const save = (v: string) => { setStart(v); try { localStorage.setItem('crp_ai_credit', v); } catch { /* private window */ } };
  const money = (x: number) => `$${x.toFixed(x < 1 ? 4 : 2)}`;
  const loaded = parseFloat(start); const cap = u?.budget_usd ?? null;
  const left = u ? (Number.isFinite(loaded) ? loaded - u.all_time_cost_usd : cap != null ? cap - u.all_time_cost_usd : null) : null;
  return (
    <Card title="AI credits used" subtitle="Temporary. The money the app has spent on AI so far.">
      {err ? <p className="text-sm text-red-700">{err}</p> : !u ? <p className="text-sm text-ink-500">Loading…</p> : (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {[['Used so far', money(u.all_time_cost_usd), `${u.all_time_calls} AI calls`], ['Used in the last 30 days', money(u.cost_usd), `${u.calls} AI calls${u.failed ? `, ${u.failed} failed` : ''}`],
              ['Left', left == null ? '–' : money(Math.max(0, left)), left == null ? 'Type your credit below' : Number.isFinite(loaded) ? `of ${money(loaded)} you entered` : `of the app limit ${money(cap as number)}`]].map(([t, v, n]) => (
              <div key={t} className="rounded-2xl bg-brand-50/60 p-3"><p className="text-xs font-semibold text-ink-500">{t}</p><p className="mt-0.5 font-serif text-2xl font-semibold text-ink-900">{v}</p><p className="text-xs text-ink-500">{n}</p></div>))}
          </div>
          <label className="mt-3 block text-sm font-semibold text-ink-700"><span className="block">Credit you loaded on the AI account (US dollars)</span>
            <Input className="mt-1 max-w-[12rem]" inputMode="decimal" placeholder="for example 20" value={start} onChange={(e) => save(e.target.value)} /></label>
          <p className="mt-2 text-xs text-ink-500">The app adds up the cost of every AI call it makes (an estimate). It cannot read your account balance, so type the credit you loaded to see what is left. The exact balance is on your AI account&apos;s billing page.</p>
          {u.by_task.length > 0 && (
            <ul className="mt-3 divide-y divide-brand-50 text-sm">{Object.values(u.by_task.reduce<Record<string, { task: string; calls: number; cost: number }>>((m, r) => { (m[r.task] ??= { task: r.task, calls: 0, cost: 0 }); m[r.task].calls += r.calls; m[r.task].cost += r.cost; return m; }, {})).sort((a, b) => b.cost - a.cost).slice(0, 6).map((r) => (
              <li key={r.task} className="flex flex-wrap items-center justify-between gap-2 py-1.5"><span className="text-ink-700">{r.task.replace(/_/g, ' ')} <span className="text-xs text-ink-400">({r.calls} calls)</span></span><b className="tabular-nums text-ink-900">{money(r.cost)}</b></li>))}</ul>)}
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { lang, setLang } = useLang();
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
    <PageShell title="Settings" subtitle="Choose how the app looks and which language it speaks.">
      <Card tour="s-colours" title="Colours" subtitle="Pick the colours you like. The change is saved on this device.">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          {THEMES.map((t, i) => (
            <button key={t.name} onClick={() => pickTheme(i)} aria-pressed={theme === i}
              className={`flex flex-col items-start gap-2 rounded-2xl p-3 text-start ring-1 transition sm:flex-row sm:items-center sm:gap-3 ${theme === i ? 'bg-brand-50 ring-2 ring-brand-600' : 'bg-surface ring-brand-100 hover:ring-brand-300'}`}>
              <span className="flex shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">{[t.brand[3], t.brand[6], t.brand[8], t.page].map((c) => <span key={c} className="h-9 w-4" style={{ background: c }} />)}</span>
              <span className="min-w-0 flex-1 text-sm font-semibold text-ink-900">{t.name}</span>
              {theme === i && <Check size={16} className="shrink-0 text-brand-700" />}
            </button>
          ))}
        </div>
      </Card>

      <Card className="hidden md:block" title="Layout of your priority list" subtitle="How the schools and teachers are shown on the first page (wide screens).">
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

      <Card tour="s-language" title="Language" subtitle="Menus and buttons change to your language. Names and records stay as they are.">
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

      <AICredits />

      <Card tour="s-account" title="Account">
        {user && (
          <p className="mb-3 text-sm text-ink-700">Signed in as <b className="text-ink-900">{user.title ? `${user.title} ` : ''}{user.name}</b> <span className="text-ink-500">({user.email})</span>
            {user.is_demo && <span className="ms-2 rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-100">Demo account</span>}</p>
        )}
        {!leaving ? <Button variant="danger" icon={<LogOut size={16} />} onClick={() => setLeaving(true)}>Log out</Button> : (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-ink-700">Sign out of the app on this device?</span>
            <Button variant="danger" icon={<LogOut size={16} />} onClick={logOut}>Yes, log out</Button>
            <Button variant="ghost" onClick={() => setLeaving(false)}>Stay</Button>
          </div>
        )}
      </Card>
    </PageShell>
  );
}
