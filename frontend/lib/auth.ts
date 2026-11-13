'use client';
// Who is signed in on this device. The token is sent with every call (lib/api.ts); the profile is kept so the app can greet the person.
import { useEffect, useState } from 'react';

export interface CrpUser {
  id: string; email: string; name: string; title: string | null; salutation: 'sir' | 'maam' | null; is_demo: boolean; cluster?: string | null; district?: string | null;
}

const TOKEN = 'crp-token';
const USER = 'crp-user';
const CHANGED = 'crp-auth';
const tell = () => { try { window.dispatchEvent(new Event(CHANGED)); } catch { /* ignore */ } };

export const session = {
  token: (): string | null => { try { return localStorage.getItem(TOKEN); } catch { return null; } },
  user: (): CrpUser | null => { try { return JSON.parse(localStorage.getItem(USER) || 'null'); } catch { return null; } },
  set: (token: string, user: CrpUser) => { try { localStorage.setItem(TOKEN, token); localStorage.setItem(USER, JSON.stringify(user)); } catch { /* ignore */ } tell(); },
  setUser: (user: CrpUser) => { try { localStorage.setItem(USER, JSON.stringify(user)); } catch { /* ignore */ } tell(); },
  clear: () => { try { localStorage.removeItem(TOKEN); localStorage.removeItem(USER); } catch { /* ignore */ } tell(); },
  /** Runs `fn` whenever someone signs in or out (also in another tab). */
  onChange: (fn: () => void) => {
    window.addEventListener(CHANGED, fn); window.addEventListener('storage', fn);
    return () => { window.removeEventListener(CHANGED, fn); window.removeEventListener('storage', fn); };
  },
};

/** The signed-in person (null until the page has loaded, or when nobody is signed in). */
export function useUser(): CrpUser | null {
  const [user, setUser] = useState<CrpUser | null>(null);
  useEffect(() => { const sync = () => setUser(session.user()); sync(); return session.onChange(sync); }, []);
  return user;
}
