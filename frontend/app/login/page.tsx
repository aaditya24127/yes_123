'use client';
// Sign in to the CRP app. The sign-ins are private (named in the host settings), so there is no demo fill-in; the 'New account' tab
// appears only when the host allows new accounts (ALLOW_SIGNUP=1).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardCheck, Eye, EyeOff, LogIn, Mic, Target, UserPlus } from 'lucide-react';
import { api } from '@/lib/api';
import { session } from '@/lib/auth';
import { Button } from '@/components/ui';
import AuthLayout from '@/components/AuthLayout';
import { useLang } from '@/lib/i18n';

const field = 'mt-1 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600';
const TITLES = [['', 'Prefer not to say'], ['Mr.', 'Mr.'], ['Mrs.', 'Mrs.'], ['Ms.', 'Ms.']] as const;

export default function Login() {
  const { tr } = useLang();
  const router = useRouter();
  const [mode, setMode] = useState<'in' | 'new'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [canSignup, setCanSignup] = useState(false);

  useEffect(() => { api.auth.options().then((o) => setCanSignup(!!o.signup)).catch(() => {}); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = mode === 'in' ? await api.auth.login(email, password) : await api.auth.signup({ email, password, full_name: name, title: title || null });
      session.set(r.token, r.user);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : tr('Could not sign in.'));
      setBusy(false);
    }
  };
  const swap = (m: 'in' | 'new') => { setMode(m); setError(''); };
  const canSend = mode === 'in' ? !!email && !!password : !!email && password.length >= 8 && name.trim().length >= 2;

  const teacherUrl = process.env.NEXT_PUBLIC_TEACHER_APP_URL;
  return (
    <AuthLayout badge="For CRPs" headline="Know whom to visit first, and why." sub="Your schools, your teachers and your visits in one calm place, on your phone."
      points={[
        { icon: <Target size={20} />, title: 'A clear priority list', text: 'Every school and teacher is ranked, and every score shows where it came from.' },
        { icon: <ClipboardCheck size={20} />, title: 'Visits made simple', text: 'Brief, notes, student answers and an AI check of the lesson, step by step.' },
        { icon: <Mic size={20} />, title: 'Reports in your language', text: 'A friendly report and a short voice message for the teacher, in 11 languages.' },
      ]}
      footer={teacherUrl ? <a href={teacherUrl} className="inline-block py-2 text-sm font-semibold text-brand-700 underline underline-offset-2">{tr('I am a teacher: open the teacher app')}</a> : undefined}>
      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-6 shadow-lift ring-1 ring-brand-100 sm:p-7">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-ink-900">{mode === 'in' ? tr('Welcome back') : tr('Create your account')}</h2>
          <p className="mt-0.5 text-sm text-ink-500">{mode === 'in' ? tr('Sign in to see your schools.') : tr('It takes less than a minute.')}</p>
        </div>
        {canSignup && (
          <div className="flex rounded-full bg-brand-50 p-1 text-sm font-semibold">
            <button type="button" onClick={() => swap('in')} aria-pressed={mode === 'in'} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'in' ? 'bg-brand-600 text-white shadow-float' : 'text-ink-500 hover:text-brand-700'}`}>{tr('Sign in')}</button>
            <button type="button" onClick={() => swap('new')} aria-pressed={mode === 'new'} className={`flex-1 rounded-full px-3 py-2 transition ${mode === 'new' ? 'bg-brand-600 text-white shadow-float' : 'text-ink-500 hover:text-brand-700'}`}>{tr('New account')}</button>
          </div>
        )}

        {mode === 'new' && (
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <label className="block">
              <span className="text-sm font-semibold text-ink-700">{tr('Title')}</span>
              <select value={title} onChange={(e) => setTitle(e.target.value)} className={field} aria-label={tr('Title')}>
                {TITLES.map(([v, l]) => <option key={l} value={v}>{v ? l : '—'}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-ink-700">{tr('Your name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" placeholder={tr('First and last name')} className={field} />
            </label>
          </div>
        )}
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">{tr('Email')}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" autoCapitalize="none" placeholder={tr('you@example.com')} className={field} />
        </label>
        <label className="block">
          <span className="text-sm font-semibold text-ink-700">{tr('Password')}</span>
          <div className="relative mt-1">
            <input type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
              minLength={mode === 'new' ? 8 : undefined} className={`${field} !mt-0 pe-12`} />
            <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? tr('Hide password') : tr('Show password')} className="absolute end-0.5 top-1/2 -translate-y-1/2 p-3 text-ink-400 hover:text-brand-700">
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {mode === 'new' && <span className="mt-1 block text-xs text-ink-500">{tr('At least 8 letters or numbers.')}</span>}
        </label>

        {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-700 ring-1 ring-red-200">{tr(error)}</p>}
        <Button type="submit" busy={busy} className="w-full !py-3" disabled={!canSend} icon={mode === 'in' ? <LogIn size={16} /> : <UserPlus size={16} />}>{mode === 'in' ? tr('Sign in') : tr('Create my account')}</Button>
      </form>
    </AuthLayout>
  );
}
