'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Eye, EyeOff, ListChecks, LogIn, Mic } from 'lucide-react';
import { api, token } from '@/lib/api';
import { Button } from '@/components/ui';
import AuthLayout from '@/components/AuthLayout';
import { useLang } from '@/lib/i18n';

export default function Login() {
  const { tr } = useLang();
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
      setError(err instanceof Error ? err.message : tr('Could not sign in.'));
      setBusy(false);
    }
  };

  const crpUrl = process.env.NEXT_PUBLIC_CRP_APP_URL;
  return (
    <AuthLayout badge="For teachers" headline="Your mentor, always one tap away." sub="Tasks from your CRP, your visit reports and a short voice message in your own language."
      points={[
        { icon: <ListChecks size={20} />, title: 'Tasks, one at a time', text: 'See what your CRP asked for and send it from your phone.' },
        { icon: <Mic size={20} />, title: 'Listen to your review', text: 'After a visit, hear friendly suggestions in your language, and read the report.' },
        { icon: <Bell size={20} />, title: 'Alerts on your phone', text: 'A buzz when something new arrives, even when the app is closed.' },
      ]}
      footer={crpUrl ? <a href={crpUrl} className="inline-block py-2 text-sm font-semibold text-brand-700 underline underline-offset-2">{tr('I am a CRP: open the CRP app')}</a> : undefined}>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-lift ring-1 ring-brand-100 sm:p-7">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink-900">{tr('Welcome')}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{tr('Sign in to see your tasks.')}</p>
        </div>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">{tr('Email')}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoCapitalize="none" placeholder={tr('firstname.lastname@crp.com')}
            className="mt-1 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">{tr('Password')}</span>
          <div className="relative mt-1">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password"
              className="w-full rounded-2xl border-0 bg-page py-3 pe-12 ps-4 text-ink-900 ring-1 ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-600" />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? tr('Hide password') : tr('Show password')} className="absolute end-0.5 top-1/2 -translate-y-1/2 p-3 text-ink-400 hover:text-brand-700">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </label>
        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{tr(error)}</p>}
        <Button type="submit" busy={busy} className="w-full !py-3" disabled={!email || !password}><LogIn size={16} />{tr('Sign in')}</Button>
        <p className="text-center text-xs text-ink-500">{tr('Your email is your first and last name, like')}{' '}<b>{tr('firstname.lastname@crp.com')}</b>{tr('. Forgot the password? Ask your CRP.')}</p>
      </form>
    </AuthLayout>
  );
}
