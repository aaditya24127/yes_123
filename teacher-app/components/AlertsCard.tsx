'use client';
// "Turn on alerts" card: phone / browser notifications for new tasks and messages, even when the app is closed.
import { useCallback, useEffect, useState } from 'react';
import { BellOff, BellRing, Send, Smartphone } from 'lucide-react';
import { disablePush, enablePush, pushState, sendTestAlert, type PushState } from '@/lib/push';
import { Button, Card } from '@/components/ui';
import { useLang } from '@/lib/i18n';

export default function AlertsCard({ always = false, className = '' }: { always?: boolean; className?: string }) {
  const { tr } = useLang();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const refresh = useCallback(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  useEffect(refresh, [refresh]);

  if (!state) return null;
  if (state === 'on' && !always) return null;
  if (state === 'unsupported' && !always) return null;

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : tr('Something went wrong.') }); }
    setBusy(false); refresh();
  };

  let icon = <BellRing size={22} className="shrink-0 text-brand-600" />;
  let text = tr('Get a buzz on this phone when your CRP sends you something new, even when the app is closed.');
  let actions: React.ReactNode = (
    <Button variant="soft" className="!px-4 !py-2" busy={busy} onClick={() => run(async () => {
      const s = await enablePush();
      if (s === 'not-ready') throw new Error(tr('Alerts are not set up on the server yet.'));
      if (s === 'blocked') throw new Error(tr('Alerts are blocked in this browser. Allow notifications for this site in the browser settings.'));
    })}>{tr('Turn on')}</Button>
  );

  if (state === 'on') {
    icon = <BellRing size={22} className="shrink-0 text-emerald-600" />;
    text = tr('Alerts are on for this phone.');
    actions = (
      <div className="flex gap-2">
        <Button variant="soft" className="!px-4 !py-2" busy={busy} onClick={() => run(sendTestAlert, tr('Test alert sent. It should appear in a moment.'))}><Send size={14} />{tr('Test')}</Button>
        <Button variant="ghost" className="!px-3 !py-2" disabled={busy} onClick={() => run(disablePush)}>{tr('Turn off')}</Button>
      </div>
    );
  } else if (state === 'blocked') {
    icon = <BellOff size={22} className="shrink-0 text-amber-600" />;
    text = tr('Alerts are blocked. To turn them on, allow notifications for this site in your browser settings.');
    actions = null;
  } else if (state === 'needs-install') {
    icon = <Smartphone size={22} className="shrink-0 text-brand-600" />;
    text = tr('On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen), then open it from there to turn on alerts.');
    actions = null;
  } else if (state === 'unsupported') {
    icon = <BellOff size={22} className="shrink-0 text-ink-400" />;
    text = tr('This browser cannot show alerts. Try Chrome on Android, or Safari from the Home Screen on iPhone.');
    actions = null;
  }

  return (
    <Card className={className}>
      <div className="flex items-center gap-3">{icon}<p className="flex-1 text-sm text-ink-700">{tr(text)}</p>{actions}</div>
      {msg && <p role="status" className={`mt-3 rounded-2xl px-4 py-2.5 text-sm ring-1 ${msg.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-red-50 text-red-700 ring-red-200'}`}>{tr(msg.text)}</p>}
    </Card>
  );
}
