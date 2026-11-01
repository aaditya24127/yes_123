'use client';
// Alerts on this phone / browser (Web Push). The server's public key comes from /api/teacher/push/key; nothing secret lives here.
import { token } from './api';

export type PushState = 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on' | 'not-ready';

const auth = (): HeadersInit => ({ Authorization: `Bearer ${token.get() ?? ''}`, 'Content-Type': 'application/json' });
const b64ToBytes = (s: string) => {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

export async function pushState(): Promise<PushState> {
  if (typeof window === 'undefined') return 'unsupported';
  const hasApi = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (!hasApi) return isIos() && !standalone() ? 'needs-install' : 'unsupported';   // iPhones allow alerts only for an app added to the home screen
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = await reg?.pushManager.getSubscription();
    if (sub && Notification.permission === 'granted') return 'on';
  } catch { /* fall through */ }
  return 'off';
}

export async function enablePush(): Promise<PushState> {
  const keyRes = await fetch('/api/teacher/push/key');
  const { key } = (await keyRes.json()) as { key: string | null };
  if (!key) return 'not-ready';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'blocked' : 'off';
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const res = await fetch('/api/teacher/push/subscribe', { method: 'POST', headers: auth(), body: JSON.stringify(sub.toJSON()) });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ detail: 'Could not turn on alerts.' }))).detail);
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration('/sw.js');
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch('/api/teacher/push/unsubscribe', { method: 'POST', headers: auth(), body: JSON.stringify({ endpoint: sub.endpoint }) });
  await sub.unsubscribe();
}

export async function sendTestAlert(): Promise<void> {
  const res = await fetch('/api/teacher/push/test', { method: 'POST', headers: auth() });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ detail: 'Could not send a test alert.' }))).detail);
}
