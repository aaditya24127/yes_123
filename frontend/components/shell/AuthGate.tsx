'use client';
// Only a signed-in CRP sees the app. Everyone else is taken to the sign-in page (and back to the app once signed in).
// Done in the browser (no server middleware), so the same code works in the Android / iOS app build.
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { session } from '@/lib/auth';

export const isLoginPath = (path: string | null) => (path ?? '').replace(/\/$/, '') === '/login';
// Pages a teacher opens from a link, without signing in (the link carries a signed code): the report page.
export const isPublicPath = (path: string | null) => (path ?? '').replace(/\/$/, '') === '/r';
// No menu, no tutorial: the sign-in page and the public pages.
export const isBarePath = (path: string | null) => isLoginPath(path) || isPublicPath(path);

export default function AuthGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const onLogin = isLoginPath(path);
  const onPublic = isPublicPath(path);

  useEffect(() => {
    const sync = () => { setSignedIn(!!session.token()); setReady(true); };
    sync();
    // Check once with the server that the saved sign-in is still good (it also refreshes the name shown in the app).
    if (session.token()) api.auth.me().then((u) => session.setUser(u)).catch(() => { /* a 401 already signed the person out */ });
    return session.onChange(sync);
  }, []);

  // Once signed in, quietly fetch what the other pages will ask for, so the first move to each of them is quick.
  useEffect(() => { if (!ready || !signedIn) return; const h = setTimeout(() => { api.warm(); }, 600); return () => clearTimeout(h); }, [ready, signedIn]);

  useEffect(() => {
    if (!ready || onPublic) return;
    if (!signedIn && !onLogin) router.replace('/login');
    if (signedIn && onLogin) router.replace('/');
  }, [ready, signedIn, onLogin, router]);

  if (onPublic) return <>{children}</>;
  if (!ready || signedIn === onLogin) return null;      // nothing flashes while we work out where the person belongs
  return <>{children}</>;
}
