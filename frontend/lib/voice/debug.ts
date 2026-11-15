'use client';
// A trace of what the voice assistant heard and said, for testing: only recorded when localStorage "crp-voice-debug" is "1" (then window.__crpVoice holds it).
export function addDebug(kind: string, data: unknown) {
  try {
    if (localStorage.getItem('crp-voice-debug') !== '1') return;
    const w = window as unknown as { __crpVoice?: { t: number; kind: string; data: unknown }[] };
    (w.__crpVoice ??= []).push({ t: Date.now(), kind, data });
  } catch { /* private window */ }
}
