'use client';
// The state of the voice assistant, shared by the controller (engine.ts) and the screen (components/voice). A tiny store, no library.
import { useSyncExternalStore } from 'react';

export type VStatus = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface PendingAction { say: string; chips: string[]; run: () => Promise<void>; }
export interface Turn { who: 'you' | 'assistant'; text: string; }

export interface VState {
  on: boolean;                 // voice mode is switched on
  status: VStatus;
  level: number;               // 0..1, how loud the CRP is speaking (moves the orb)
  interim: string;             // what is being heard right now
  heard: string;               // the last sentence heard
  reply: string;               // the last thing the assistant said
  doing: string[];             // what the assistant is doing right now (shown on screen)
  pending: PendingAction | null;   // an action waiting for yes / no
  confirmAll: boolean;         // ask before every action, also opening pages
  muted: boolean;              // the assistant does not speak, it only shows text
  open: boolean;               // the panel is expanded
  log: Turn[];
  error: string;
  support: { listen: boolean; speak: boolean; mode: 'browser' | 'whisper' | 'none' };
}

const KEY = 'crp-voice';
const saved = (): Partial<VState> => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } };

let state: VState = {
  on: false, status: 'idle', level: 0, interim: '', heard: '', reply: '', doing: [], pending: null, confirmAll: false, muted: false, open: true, log: [], error: '',
  support: { listen: true, speak: true, mode: 'browser' },
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getVoice = () => state;
export function setVoice(p: Partial<VState>) {
  state = { ...state, ...p }; emit();
  if ('confirmAll' in p || 'muted' in p || 'on' in p || 'open' in p) {
    try { localStorage.setItem(KEY, JSON.stringify({ on: state.on, confirmAll: state.confirmAll, muted: state.muted, open: state.open })); } catch { /* private window */ }
  }
}
export function loadVoicePrefs() { const s = saved(); state = { ...state, confirmAll: !!s.confirmAll, muted: !!s.muted, open: s.open !== false }; emit(); return s; }
export const addTurn = (t: Turn) => setVoice({ log: [...state.log, t].slice(-30) });

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useVoice = () => useSyncExternalStore(subscribe, getVoice, getVoice);
