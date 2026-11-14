'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, AuthError, token, type Home } from './api';
import { localeNow, trNow } from './i18n';

const EVERY_MS = 10000;

/**
 * The signed-in teacher's data, refreshed every few seconds while the app is open (this is how a new task from the CRP appears).
 * Not signed in, or the sign-in expired: goes to /login. (Alerts while the app is closed come from Web Push, see lib/push.ts.)
 */
export function useHome() {
  const router = useRouter();
  const [data, setData] = useState<Home | null>(null);
  const [error, setError] = useState('');
  const seen = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (!token.get()) { router.replace('/login'); return; }
    try {
      const h = await api.home();
      setData(h); setError('');
      seen.current = h.notifications.length;
    } catch (e) {
      if (e instanceof AuthError) { token.clear(); router.replace('/login'); return; }
      setError('Cannot reach the server. Showing the last information.');
    }
  }, [router]);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, EVERY_MS);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  return { data, error, reload: load };
}

export function fmtDate(iso: string | null | undefined) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return d.toLocaleDateString(localeNow(), { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return trNow('just now');
  if (s < 3600) return trNow('{n} min ago', { n: Math.floor(s / 60) });
  if (s < 86400) return trNow('{n} h ago', { n: Math.floor(s / 3600) });
  return fmtDate(iso);
}
