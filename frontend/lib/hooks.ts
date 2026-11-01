'use client';
// Small shared hooks: load once, poll while background work runs, and the school/teacher directory.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { POLL_MS } from './app.config';
import type { Directory } from './types';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const reload = useCallback(() => {
    const id = ++seq.current; setLoading(true);
    return fn().then((d) => { if (id === seq.current) { setData(d); setError(''); } }).catch((e) => id === seq.current && setError(String(e.message || e)))
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
export function useDirectory() {
  const [dir, setDir] = useState<Directory | null>(null);
  useEffect(() => { (dirCache ??= api.directory()).then(setDir).catch(() => { dirCache = null; }); }, []);
  return dir;
}
export function refreshDirectory() { dirCache = null; }
