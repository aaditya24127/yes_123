'use client';
// Sign in to the CRP app, or make a new account. The demo account is a normal account: the button only fills in its email and password.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn, Sparkles, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { session } from '@/lib/auth';
import { APP } from '@/lib/app.config';
import { Button } from '@/components/ui';

const field = 'mt-1 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600';
const TITLES = [['', 'Prefer not to say'], ['Mr.', 'Mr.'], ['Mrs.', 'Mrs.'], ['Ms.', 'Ms.']] as const;

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [demo, setDemo] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => { api.auth.demo().then((d) => { if (d.enabled && d.email && d.password) setDemo({ email: d.email, password: d.password }); }).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = mode === 'in' ? await api.auth.login(email, password) : await api.auth.signup({ email, password, full_name: name, title: title || null });
      session.set(r.token, r.user);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };
  const fillDemo = () => { if (!demo) return; setMode('in'); setEmail(demo.email); setPassword(demo.password); setError(''); };
  const swap = (m: 'in' | 'new') => { setMode(m); setError(''); };
  const canSend = mode === 'in' ? !!email && !!password : !!email && password.length >= 8 && name.trim().length >= 2;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-800 text-3xl font-bold text-white shadow-lift">{APP.short}</div>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-ink-900">{APP.name}</h1>
        <p className="mt-1 text-sm text-ink-500">Know whom to visit first, and why.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-float ring-1 ring-brand-100">
        <div className="flex rounded-full bg-brand-50 p-1 text-sm font-semibold">
          <button type="button" onClick={() => swap('in')} aria-pressed={mode === 'in'} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'in' ? 'bg-brand-600 text-white shadow-float' : 'text-ink-500 hover:text-brand-700'}`}>Sign in</button>
          <button type="button" onClick={() => swap('new')} aria-pressed={mode === 'new'} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'new' ? 'bg-brand-600 text-white shadow-float' : 'text-ink-500 hover:text-brand-700'}`}>New account</button>
        </div>

        {mode === 'new' && (
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink-700">Title</span>
              <select value={title} onChange={(e) => setTitle(e.target.value)} className={field} aria-label="Title">
                {TITLES.map(([v, l]) => <option key={l} value={v}>{v ? l : '—'}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-700">Your name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder="First and last name" className={field} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoCapitalize="none" placeholder="you@example.com" className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">Password</span>
          <div className="relative mt-1">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              minLength={mode === 'new' ? 8 : undefined} className={`${field} !mt-0 pe-12`} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-brand-700">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {mode === 'new' && <span className="mt-1 block text-xs text-ink-500">At least 8 letters or numbers.</span>}
        </label>

        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        <Button type="submit" busy={busy} className="w-full" disabled={!canSend} icon={mode === 'in' ? <LogIn size={16} /> : <UserPlus size={16} />}>{mode === 'in' ? 'Sign in' : 'Create my account'}</Button>

        {demo && mode === 'in' && (
          <div className="rounded-2xl bg-brand-50/70 p-3 text-center">
            <p className="text-xs text-ink-500">Just looking at the prototype?</p>
            <button type="button" onClick={fillDemo} className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
              <Sparkles size={15} />Fill in the demo account
            </button>
            <p className="mt-1 text-[11px] text-ink-400">Then press Sign in.</p>
          </div>
        )}
      </form>
    </div>
  );
}
