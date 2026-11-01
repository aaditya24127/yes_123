'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { api, token } from '@/lib/api';
import { Button } from '@/components/ui';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api.login(email, password);
      token.set(r.token);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 pb-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-800 text-3xl font-bold text-white shadow-lift">C</div>
        <h1 className="mt-4 font-serif text-3xl font-semibold text-ink-900">CRP Mentor Copilot</h1>
        <p className="mt-1 text-sm font-semibold uppercase tracking-wider text-brand-500">Teacher app</p>
      </div>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-float ring-1 ring-brand-100">
        <h2 className="font-serif text-xl font-semibold text-ink-900">Sign in</h2>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoCapitalize="none" placeholder="firstname.lastname@crp.com"
            className="mt-1 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">Password</span>
          <div className="relative mt-1">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="w-full rounded-2xl border-0 bg-page py-3 pe-12 ps-4 text-ink-900 ring-1 ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-600" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-400 hover:text-brand-700">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{error}</p>}
        <Button type="submit" busy={busy} className="w-full" disabled={!email || !password}><LogIn size={16} />Sign in</Button>
        <p className="text-center text-xs text-ink-500">Your email is your first and last name, like <b>firstname.lastname@crp.com</b>. Forgot the password? Ask your CRP.</p>
      </form>
    </div>
  );
}
