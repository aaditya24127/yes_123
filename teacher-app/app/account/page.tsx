'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, LogOut, School } from 'lucide-react';
import { api, token } from '@/lib/api';
import { useHome } from '@/lib/hooks';
import Shell from '@/components/Shell';
import { Button, Card, Title } from '@/components/ui';

const field = 'mt-1 w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 focus:outline-none focus:ring-2 focus:ring-brand-600';

export default function Account() {
  const router = useRouter();
  const { data, error } = useHome();
  const [oldPw, setOld] = useState('');
  const [newPw, setNew] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const change = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await api.password(oldPw, newPw); setOld(''); setNew(''); setMsg({ ok: true, text: 'Password changed.' }); }
    catch (err) { setMsg({ ok: false, text: err instanceof Error ? err.message : 'Could not change the password.' }); }
    setBusy(false);
  };

  return (
    <Shell home={data} error={error}>
      <Title>Me</Title>
      {data && (
        <Card>
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white">{data.teacher.name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/, '').slice(0, 1)}</div>
            <div className="min-w-0"><p className="truncate font-serif text-xl font-semibold text-ink-900">{data.teacher.name}</p><p className="truncate text-sm text-ink-500">{data.teacher.email}</p></div>
          </div>
          <p className="mt-4 flex items-center gap-2 text-sm text-ink-700"><School size={16} className="text-brand-500" />{data.teacher.school}</p>
          {data.teacher.subjects && <p className="mt-1 text-sm text-ink-500">{data.teacher.subjects.join(', ')}{data.teacher.classes?.length ? ` · Class ${data.teacher.classes.join(', ')}` : ''}</p>}
        </Card>
      )}
      <form onSubmit={change} className="mt-4 rounded-3xl bg-surface p-5 shadow-float ring-1 ring-brand-100">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-ink-900"><KeyRound size={18} className="text-brand-500" />Change password</h2>
        <label className="mt-3 block text-sm font-semibold text-ink-700">Current password<input type="password" value={oldPw} onChange={(e) => setOld(e.target.value)} required autoComplete="current-password" className={field} /></label>
        <label className="mt-3 block text-sm font-semibold text-ink-700">New password (at least 6 characters)<input type="password" value={newPw} onChange={(e) => setNew(e.target.value)} required minLength={6} autoComplete="new-password" className={field} /></label>
        {msg && <p role="status" className={`mt-3 rounded-2xl px-4 py-2.5 text-sm ring-1 ${msg.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{msg.text}</p>}
        <Button type="submit" busy={busy} className="mt-4 w-full" disabled={!oldPw || newPw.length < 6}>Change password</Button>
      </form>
      <Button variant="soft" className="mt-4 w-full" onClick={() => { token.clear(); router.replace('/login'); }}><LogOut size={16} />Sign out</Button>
    </Shell>
  );
}
