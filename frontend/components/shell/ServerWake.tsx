'use client';
// The free server sleeps when nobody has used it for a while and takes up to a minute to wake. This wakes it as soon as the app opens
// and tells the person what is happening, instead of showing an error.
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';

export default function ServerWake() {
  const { tr } = useLang();
  const [waking, setWaking] = useState(false);
  useEffect(() => {
    let alive = true;
    const slow = setTimeout(() => alive && setWaking(true), 2500);
    (async () => {
      for (let i = 0; i < 4 && alive; i++) { try { await api.health(); break; } catch { /* still waking: try again */ } }
      clearTimeout(slow); if (alive) setWaking(false);
    })();
    return () => { alive = false; clearTimeout(slow); };
  }, []);
  if (!waking) return null;
  return (
    <div role="status" className="fixed left-1/2 top-3 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full bg-brand-800 px-4 py-2 text-sm font-semibold text-white shadow-panel">
      <Loader2 size={16} className="shrink-0 animate-spin" />{tr('Getting things ready. The first load of the day can take up to a minute.')}{' '}</div>
  );
}
