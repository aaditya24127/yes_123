'use client';
// Whether the tutorial is on, which step it is at, and whether the voice is muted. Kept on this device so it survives moving
// between pages and a reload.
import { useSyncExternalStore } from 'react';
import { STEPS } from './steps';

export interface TutorialState { on: boolean; i: number; muted: boolean }

const KEY = 'crp-tutorial';
const OFF: TutorialState = { on: false, i: 0, muted: false };
let state: TutorialState = OFF;
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === 'undefined') return;
  loaded = true;
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) state = { on: !!s.on, i: Math.max(0, Math.min(STEPS.length - 1, Number(s.i) || 0)), muted: !!s.muted };
  } catch { /* ignore */ }
}
function set(p: Partial<TutorialState>) {
  load();
  state = { ...state, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  subs.forEach((f) => f());
}

export const tutorial = {
  get: (): TutorialState => { load(); return state; },
  /** Turning it on always begins with the welcome. */
  start: () => set({ on: true, i: 0 }),
  stop: () => set({ on: false }),
  go: (i: number) => set({ i: Math.max(0, Math.min(STEPS.length - 1, i)) }),
  mute: (muted: boolean) => set({ muted }),
  subscribe: (fn: () => void) => { subs.add(fn); return () => { subs.delete(fn); }; },
};

export const useTutorial = (): TutorialState => useSyncExternalStore(tutorial.subscribe, tutorial.get, () => OFF);
