'use client';
// Small shared hooks: load once, poll while background work runs, and the school/teacher directory.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { session } from './auth';
import { POLL_MS } from './app.config';
import type { Directory } from './types';

// The last answer of lists that are polled (never reused as a final answer): shown at once when a page opens again, while a fresh one is fetched.
const lastSeen = new Map<string, unknown>();
if (typeof window !== 'undefined') { let who = session.token(); session.onChange(() => { const now = session.token(); if (now !== who) { who = now; lastSeen.clear(); } }); }

/** `lastKey`: remember the last answer under this name, and show it straight away next time while the new one loads. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = [], lastKey?: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => { if (lastKey && lastSeen.has(lastKey)) setData((d) => d ?? (lastSeen.get(lastKey) as T)); }, [lastKey]);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const id = ++seq.current; setLoading(true);
    return fn().then((d) => { if (id === seq.current) { setData(d); setError(''); if (lastKey) lastSeen.set(lastKey, d); } }).catch((e) => id === seq.current && setError(String(e.message || e)))
      .finally(() => id === seq.current && setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, error, setError, loading, reload };
}

/** Calls `tick` every POLL_MS while `active` is true (used for imports, transcription and evaluation). */
export function usePoll(active: boolean, tick: () => void, ms = POLL_MS) {
  const t = useRef(tick); t.current = tick;
  useEffect(() => {
    if (!active) return;
    const h = setInterval(() => t.current(), ms);
    return () => clearInterval(h);
  }, [active, ms]);
}

let dirCache: Promise<Directory> | null = null;
const dirListeners = new Set<(d: Directory) => void>();
export function useDirectory() {
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => { dirListeners.add(setDir); (dirCache ??= api.directory()).then(setDir).catch(() => { dirCache = null; }); return () => { dirListeners.delete(setDir); }; }, []);
  return dir;
}
/** Call after the list of schools or teachers changed: every page showing it gets the new list. */
export function refreshDirectory() {
  dirCache = api.directory();
  dirCache.then((d) => dirListeners.forEach((f) => f(d))).catch(() => { dirCache = null; });
}
