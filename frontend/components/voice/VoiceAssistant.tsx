'use client';
// The voice assistant on screen (mounted once, in the layout). When voice mode is on, the glowing circle sits at the bottom right and shows what the assistant is doing
// (listening, thinking, speaking); above it a panel shows what was heard, what is said, the action it is about to do and the Confirm / Cancel buttons.
// Everything is also usable with the keyboard: Alt+V switches voice mode, Esc stops the assistant speaking, Enter in the box sends a typed command.
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ChevronDown, Keyboard, Mic, Send, Volume2, VolumeX, X } from 'lucide-react';
import { isBarePath } from '@/components/shell/AuthGate';
import { VoiceOrb } from '@/components/ui/VoiceOrb';
import { useLang } from '@/lib/i18n';
import { bindHost, cancelPending, interrupt, runPending, start, stop, toggle, typed } from '@/lib/voice/engine';
import { loadVoicePrefs, setVoice, useVoice } from '@/lib/voice/store';

export default function VoiceAssistant() {
  const path = usePathname(); const router = useRouter();
  const { tr, lang, setLang } = useLang();
  const v = useVoice();
  const [text, setText] = useState('');
  const logRef = useRef<HTMLDivElement>(null);

  // The controller needs navigation, translation and the language: handed over on every render so it is never stale.
  bindHost({ nav: (p) => router.push(p), path: () => window.location.pathname + window.location.search, tr, lang, setLang, turnOff: () => stop() });
  useEffect(() => { loadVoicePrefs(); }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [v.log.length, v.pending]);
  // Changing the language while voice mode is on: listen and speak in the new language.
  useEffect(() => { if (getOn()) { stop({ quiet: true }); void start({ greet: false }); } /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lang]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyV') { e.preventDefault(); void toggle(); }
      else if (e.key === 'Escape' && getOn()) { interrupt(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  if (isBarePath(path) || !v.on) return null;
  const word = v.status === 'listening' ? tr('Listening…') : v.status === 'thinking' ? tr('Thinking…') : v.status === 'speaking' ? tr('Speaking…') : tr('Ready');
  const submit = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); void typed(t); };

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-3 z-[70] flex flex-col items-end gap-3 md:bottom-6 md:right-6" data-voice-assistant>
      {v.open && (
        <section aria-label={tr('Voice assistant')} className="pointer-events-auto flex max-h-[min(62dvh,500px)] w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-3xl bg-surface shadow-panel ring-1 ring-brand-200">
          <header className="flex items-center gap-2 border-b border-brand-100 px-4 py-2.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
            <p className="min-w-0 flex-1 truncate font-serif text-base font-semibold text-ink-900" role="status">{tr('Voice assistant')} · {word}</p>
            <button onClick={() => setVoice({ muted: !v.muted })} aria-pressed={v.muted} aria-label={v.muted ? tr('The assistant is silent. Tap to let it speak') : tr('Silence the assistant')} title={v.muted ? tr('The assistant is silent. Tap to let it speak') : tr('Silence the assistant')}
              className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-brand-50">{v.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
            <button onClick={() => setVoice({ open: false })} aria-label={tr('Make smaller')} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-brand-50"><ChevronDown size={18} /></button>
            <button onClick={() => stop()} aria-label={tr('Turn voice mode off')} title={tr('Turn voice mode off')} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-red-50 hover:text-red-700"><X size={18} /></button>
          </header>

          <div ref={logRef} className="min-h-[88px] flex-1 space-y-2 overflow-y-auto px-4 py-3 text-sm" aria-live={v.support.speak && !v.muted ? 'off' : 'polite'}>
            {v.log.length === 0 && <p className="text-ink-500">{tr('Say what you want to do. For example: “open the visit page”, “which schools need a visit first?” or “help”.')}</p>}
            {v.log.slice(-6).map((t, i) => (
              <p key={i} className={t.who === 'you' ? 'ms-8 rounded-2xl rounded-ee-md bg-brand-600 px-3 py-2 text-white' : 'me-4 rounded-2xl rounded-es-md bg-brand-50 px-3 py-2 text-ink-900 ring-1 ring-brand-100'}>{t.text}</p>
            ))}
            {v.interim && <p className="ms-8 rounded-2xl bg-brand-100 px-3 py-2 italic text-brand-800">{v.interim}</p>}
            {v.status === 'thinking' && <p className="flex items-center gap-1.5 px-1 text-ink-500" aria-hidden><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:120ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-brand-500 [animation-delay:240ms]" /></p>}
          </div>

          {(v.doing.length > 0 || v.pending) && (
            <div className="border-t border-brand-100 bg-amber-50/60 px-4 py-3" data-voice-pending={v.pending ? 'yes' : 'no'}>
              <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{v.pending ? tr('I am about to') : tr('Doing')}</p>
              <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm text-ink-900">{v.doing.map((d, i) => <li key={i}>{d}</li>)}</ul>
              {v.pending && (
                <div className="mt-3 flex gap-2">
                  <button onClick={() => void runPending()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><Check size={18} />{tr('Yes, go ahead')}</button>
                  <button onClick={() => void cancelPending()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-ink-700 ring-1 ring-brand-200 hover:bg-brand-50"><X size={18} />{tr('No')}</button>
                </div>
              )}
              {v.pending && <p className="mt-2 text-xs text-ink-500">{tr('You can also say yes or no.')}</p>}
            </div>
          )}

          {v.error && <p role="alert" className="border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{v.error}</p>}

          <form onSubmit={submit} className="flex items-center gap-2 border-t border-brand-100 px-3 py-2.5">
            <Keyboard size={16} className="shrink-0 text-ink-400" aria-hidden />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Or type a command here')} aria-label={tr('Type a command')} autoComplete="off"
              className="min-w-0 flex-1 rounded-xl border-0 bg-page px-3 py-2 text-[16px] text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
            <button type="submit" disabled={!text.trim()} aria-label={tr('Send')} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"><Send size={16} /></button>
          </form>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 border-t border-brand-100 px-4 py-2 text-xs text-ink-700">
            <span><b className="text-ink-900">{tr('Ask before every action')}</b><br />{tr('Alt+V switches voice mode. Esc stops the voice.')}</span>
            <input type="checkbox" checked={v.confirmAll} onChange={(e) => setVoice({ confirmAll: e.target.checked })} className="h-5 w-5 shrink-0 accent-[rgb(var(--b600))]" />
          </label>
        </section>
      )}

      <button onClick={() => { if (v.status === 'speaking') interrupt(); setVoice({ open: !v.open }); }} aria-label={v.open ? tr('Make smaller') : tr('Open the voice assistant')} title={word}
        className="pointer-events-auto relative rounded-full bg-surface p-2 shadow-panel ring-1 ring-brand-200 transition hover:scale-105">
        <VoiceOrb state={v.status === 'idle' ? 'idle' : v.status} level={v.level} size={72} caption={false} word={word} />
        {v.pending && <span aria-hidden className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-ink-900 ring-2 ring-white">?</span>}
        {!v.open && v.status === 'listening' && <Mic size={14} aria-hidden className="absolute bottom-1 right-1 rounded-full bg-brand-600 p-0.5 text-white" />}
      </button>
    </div>
  );
}

import { getVoice } from '@/lib/voice/store';
const getOn = () => getVoice().on;
