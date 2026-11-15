'use client';
// The state of the voice assistant, shared by the controller (engine.ts) and the screen (components/voice). A tiny store, no library.
import { useSyncExternalStore } from 'react';
import type { Choices } from './forms';
import { DEFAULT_VOICE, type VoicePrefs } from './tts';

export type VStatus = 'idle' | 'listening' | 'thinking' | 'speaking';
export interface PendingAction { say: string; chips: string[]; run: () => Promise<void>; }

export interface VState {
  on: boolean;                 // voice mode is switched on
  status: VStatus;
  hearing: boolean;            // the CRP is speaking right now (the ear has noticed)
  level: number;               // 0..1: the CRP's voice while listening, the assistant's voice while speaking (moves the circle)
  heard: string;               // the last sentence heard (shown only in the settings, for troubleshooting)
  reply: string;               // the last thing the assistant said
  doing: string[];             // what the assistant is doing right now (a short line or two on screen)
  pending: PendingAction | null;   // an action waiting for yes / no
  choices: Choices | null;         // a dropdown the CRP asked to open: its choices are listed on screen and read aloud
  confirmAll: boolean;         // ask before every action, also opening pages
  muted: boolean;              // the assistant does not speak
  controls: boolean;           // the small buttons around the circle are shown
  settings: boolean;           // the settings sheet is open
  typing: boolean;             // the one-line box for typing a command is open
  error: string;
  voice: VoicePrefs;           // how the assistant sounds
  micId: string;               // chosen microphone ('' = the computer's default)
  micLabel: string;
  support: { listen: boolean; speak: boolean; mode: 'ear' | 'browser' | 'none' };
}

const KEY = 'crp-voice';
let state: VState = {
  on: false, status: 'idle', hearing: false, level: 0, heard: '', reply: '', doing: [], pending: null, choices: null, confirmAll: false, muted: false, controls: false, settings: false, typing: false, error: '',
  voice: DEFAULT_VOICE, micId: '', micLabel: '', support: { listen: true, speak: true, mode: 'ear' },
};
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getVoice = () => state;
export function setVoice(p: Partial<VState>) {
  state = { ...state, ...p }; emit();
  if ('confirmAll' in p || 'muted' in p || 'voice' in p || 'micId' in p) {
    try { localStorage.setItem(KEY, JSON.stringify({ confirmAll: state.confirmAll, muted: state.muted, voice: state.voice, micId: state.micId })); } catch { /* private window */ }
  }
}
export function loadVoicePrefs() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    state = { ...state, confirmAll: !!s.confirmAll, muted: !!s.muted, micId: typeof s.micId === 'string' ? s.micId : '', voice: { ...DEFAULT_VOICE, ...(s.voice ?? {}) } }; emit();
  } catch { /* defaults */ }
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const useVoice = () => useSyncExternalStore(subscribe, getVoice, getVoice);
