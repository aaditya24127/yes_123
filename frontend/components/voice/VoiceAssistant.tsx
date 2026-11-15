'use client';
// The voice assistant on screen (mounted once, in the layout). When voice mode is on, only a glowing circle sits at the bottom right: it shows what the assistant is doing (listening,
// thinking, speaking) and moves with the voices. There is NO chat: what is said is heard, not written. Text appears only when it must: the action waiting for a yes, a problem,
// and the settings sheet (voice, speed, microphone). Keyboard: Alt+V switches voice mode, Esc stops the assistant talking.
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Check, Keyboard, Power, Send, Settings2, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { isBarePath } from '@/components/shell/AuthGate';
import { VoiceOrb } from '@/components/ui/VoiceOrb';
import { useLang } from '@/lib/i18n';
import { listMicrophones } from '@/lib/voice/ear';
import { bindHost, cancelPending, chooseOption, earState, interrupt, previewVoice, runPending, setMic, start, stop, toggle, typed } from '@/lib/voice/engine';
import { getVoice, loadVoicePrefs, setVoice, useVoice } from '@/lib/voice/store';

const pill = (on: boolean) => `min-h-10 flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${on ? 'bg-brand-600 text-white shadow-float' : 'bg-brand-50 text-ink-700 ring-1 ring-brand-100 hover:bg-brand-100'}`;

export default function VoiceAssistant() {
  const path = usePathname(); const router = useRouter();
  const { tr, lang, setLang } = useLang();
  const v = useVoice();
  const [text, setText] = useState('');
  const [mics, setMics] = useState<{ id: string; label: string }[]>([]);
  const [room, setRoom] = useState<{ noise: number; threshold: number; ready: boolean } | null>(null);
  const typeRef = useRef<HTMLInputElement>(null);

  // The controller needs navigation, translation and the language: handed over on every render so it is never stale.
  bindHost({ nav: (p) => router.push(p), path: () => window.location.pathname + window.location.search, tr, lang, setLang, turnOff: () => stop() });
  useEffect(() => { loadVoicePrefs(); }, []);
  useEffect(() => { if (v.typing) typeRef.current?.focus(); }, [v.typing]);
  useEffect(() => {
    if (!v.on || !v.settings) return;
    void listMicrophones().then(setMics);
    const t = setInterval(() => setRoom(earState()), 500); return () => clearInterval(t);
  }, [v.on, v.settings, v.micLabel]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'KeyV') { e.preventDefault(); void toggle(); }
      else if (e.key === 'Escape' && getVoice().on) { if (getVoice().settings) setVoice({ settings: false }); else if (getVoice().choices) setVoice({ choices: null }); else interrupt(); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, []);

  if (isBarePath(path) || !v.on) return null;
  const word = v.status === 'listening' ? (v.hearing ? tr('Hearing you') : tr('Listening')) : v.status === 'thinking' ? tr('Thinking') : v.status === 'speaking' ? tr('Speaking') : tr('Ready');
  const submit = (e: React.FormEvent) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(''); void typed(t); };
  const set = (p: Partial<typeof v.voice>) => setVoice({ voice: { ...v.voice, ...p } });
  const heardNow = v.status === 'listening' && v.level > 0.12;

  return (
    <div className="pointer-events-none fixed bottom-[calc(5.2rem+env(safe-area-inset-bottom))] right-3 z-[70] flex w-[min(22rem,calc(100vw-1.5rem))] flex-col items-end gap-3 md:bottom-6 md:right-6" data-voice-assistant>
      {v.error && (
        <div role="alert" className="pointer-events-auto flex w-full items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 shadow-panel ring-1 ring-red-200">
          <TriangleAlert size={18} className="mt-0.5 shrink-0" /><p className="min-w-0 flex-1">{v.error}</p>
          <button onClick={() => setVoice({ error: '' })} aria-label={tr('Close')} className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-red-100"><X size={16} /></button>
        </div>
      )}

      {v.pending && (
        <section aria-label={tr('Action waiting for your answer')} data-voice-pending="yes" className="pointer-events-auto w-full rounded-3xl bg-surface p-4 shadow-panel ring-1 ring-amber-300">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{tr('I am about to')}</p>
          <ul className="mt-1 list-disc space-y-0.5 ps-5 text-sm font-semibold text-ink-900">{v.pending.chips.map((d, i) => <li key={i}>{d}</li>)}</ul>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void runPending()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-float hover:bg-brand-700"><Check size={18} />{tr('Yes, go ahead')}</button>
            <button onClick={() => void cancelPending()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-semibold text-ink-700 ring-1 ring-brand-200 hover:bg-brand-50"><X size={18} />{tr('No')}</button>
          </div>
          <p className="mt-2 text-xs text-ink-500">{tr('You can also say yes or no.')}</p>
        </section>
      )}

      {v.choices && !v.pending && (
        <section aria-label={tr('Choose {name}', { name: v.choices.label })} data-voice-choices="open" className="pointer-events-auto w-full rounded-3xl bg-surface p-4 shadow-panel ring-1 ring-brand-200">
          <header className="flex items-center justify-between gap-2"><h2 className="min-w-0 truncate font-serif text-base font-semibold text-ink-900">{v.choices.label}</h2>
            <button onClick={() => setVoice({ choices: null })} aria-label={tr('Close')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 hover:bg-brand-50"><X size={18} /></button></header>
          <ol className="mt-2 max-h-[min(40dvh,280px)] space-y-1 overflow-y-auto">
            {v.choices.options.map((o, i) => (
              <li key={i}><button onClick={() => void chooseOption(i)} aria-current={o === v.choices?.current} className={`flex min-h-10 w-full items-center gap-2 rounded-xl px-3 py-2 text-start text-sm font-semibold transition ${o === v.choices?.current ? 'bg-brand-600 text-white' : 'bg-brand-50 text-ink-800 hover:bg-brand-100'}`}>
                <span className="w-5 shrink-0 text-xs opacity-70">{i + 1}</span><span className="min-w-0 flex-1 truncate">{o}</span></button></li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-500">{tr('Say the name or the number, or tap one.')}</p>
        </section>
      )}

      {!v.pending && v.doing.length > 0 && (
        <div data-voice-pending="no" aria-live="off" className="pointer-events-none max-w-full rounded-2xl bg-ink-900/90 px-4 py-2 text-sm font-semibold text-white shadow-panel">
          {v.doing.slice(0, 2).map((d, i) => <p key={i} className="truncate">{d}</p>)}
        </div>
      )}

      {v.typing && (
        <form onSubmit={submit} className="pointer-events-auto flex w-full items-center gap-2 rounded-2xl bg-surface p-2 shadow-panel ring-1 ring-brand-200">
          <input ref={typeRef} data-voice-input value={text} onChange={(e) => setText(e.target.value)} placeholder={tr('Type a command')} aria-label={tr('Type a command')} autoComplete="off"
            className="min-w-0 flex-1 rounded-xl border-0 bg-page px-3 py-2 text-[16px] text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
          <button type="submit" disabled={!text.trim()} aria-label={tr('Send')} className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white disabled:opacity-40"><Send size={16} /></button>
        </form>
      )}

      {v.settings && (
        <section aria-label={tr('Voice settings')} className="pointer-events-auto max-h-[min(70dvh,520px)] w-full space-y-4 overflow-y-auto rounded-3xl bg-surface p-4 shadow-panel ring-1 ring-brand-200">
          <header className="flex items-center justify-between"><h2 className="font-serif text-lg font-semibold text-ink-900">{tr('Voice settings')}</h2>
            <button onClick={() => setVoice({ settings: false })} aria-label={tr('Close')} className="flex h-9 w-9 items-center justify-center rounded-full text-ink-500 hover:bg-brand-50"><X size={18} /></button></header>

          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">{tr('Voice')}</p>
            <div className="flex gap-2"><button className={pill(v.voice.gender === 'male')} aria-pressed={v.voice.gender === 'male'} onClick={() => set({ gender: 'male' })}>{tr('Male')}</button>
              <button className={pill(v.voice.gender === 'female')} aria-pressed={v.voice.gender === 'female'} onClick={() => set({ gender: 'female' })}>{tr('Female')}</button></div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">{tr('English accent')}</p>
            <div className="flex gap-2">{([['gb', 'British'], ['us', 'American'], ['in', 'Indian']] as const).map(([k, l]) => <button key={k} className={pill(v.voice.accent === k)} aria-pressed={v.voice.accent === k} onClick={() => set({ accent: k })}>{tr(l)}</button>)}</div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-500" htmlFor="voice-speed">{tr('Speaking speed')}: {v.voice.rate.toFixed(2)}x</label>
            <input id="voice-speed" type="range" min={0.8} max={1.3} step={0.05} value={v.voice.rate} onChange={(e) => set({ rate: Number(e.target.value) })} className="h-8 w-full accent-[rgb(var(--b600))]" />
            <label className="mb-1.5 mt-3 block text-xs font-bold uppercase tracking-wide text-ink-500" htmlFor="voice-volume">{tr('Volume')}: {Math.round((v.voice.volume ?? 1) * 100)}%</label>
            <input id="voice-volume" type="range" min={0.3} max={1.6} step={0.05} value={v.voice.volume ?? 1} onChange={(e) => set({ volume: Number(e.target.value) })} className="h-8 w-full accent-[rgb(var(--b600))]" />
            <button onClick={() => void previewVoice()} className="mt-1 inline-flex min-h-10 items-center gap-2 rounded-full bg-brand-50 px-4 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 hover:bg-brand-100"><Volume2 size={16} />{tr('Hear this voice')}</button>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-ink-500" htmlFor="voice-mic">{tr('Microphone')}</label>
            <select id="voice-mic" value={v.micId} onChange={(e) => void setMic(e.target.value)} className="w-full rounded-xl border-0 bg-page px-3 py-2.5 text-[16px] text-ink-900 ring-1 ring-brand-200">
              <option value="">{tr('Default microphone')}{v.micLabel ? ` (${v.micLabel})` : ''}</option>
              {mics.filter((m) => m.id && m.id !== 'default').map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
            <div className="mt-2 flex items-center gap-2" aria-hidden><div className="h-2 flex-1 overflow-hidden rounded-full bg-brand-100"><div className="h-full rounded-full bg-emerald-500 transition-[width] duration-75" style={{ width: `${Math.round(Math.min(1, v.level) * 100)}%` }} /></div></div>
            <p className="mt-1 text-xs text-ink-500">{heardNow ? tr('I can hear you.') : tr('Say something: the bar should move.')}{room?.ready ? ` ${tr('Room noise: {n}', { n: Math.round(room.noise * 1000) })}` : ''}</p>
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800"><span><b className="text-ink-900">{tr('Ask before every action')}</b><br /><span className="text-xs text-ink-500">{tr('Also before opening pages.')}</span></span>
            <input type="checkbox" checked={v.confirmAll} onChange={(e) => setVoice({ confirmAll: e.target.checked })} className="h-5 w-5 shrink-0 accent-[rgb(var(--b600))]" /></label>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm text-ink-800"><span><b className="text-ink-900">{tr('Silent mode')}</b><br /><span className="text-xs text-ink-500">{tr('The assistant listens and acts but does not speak.')}</span></span>
            <input type="checkbox" checked={v.muted} onChange={(e) => setVoice({ muted: e.target.checked })} className="h-5 w-5 shrink-0 accent-[rgb(var(--b600))]" /></label>

          <p className="text-xs text-ink-500">{v.heard ? `${tr('Last heard')}: “${v.heard}”. ` : ''}{tr('Alt+V switches voice mode. Esc stops the voice.')}</p>
        </section>
      )}

      <div className="pointer-events-auto flex items-end gap-2.5">
        {v.controls && (
          <div className="mb-2 flex flex-col gap-2">
            <button onClick={() => setVoice({ settings: !v.settings })} aria-label={tr('Voice settings')} title={tr('Voice settings')} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-brand-700 shadow-panel ring-1 ring-brand-200 hover:bg-brand-50"><Settings2 size={19} /></button>
            <button data-voice-keyboard onClick={() => setVoice({ typing: !v.typing })} aria-label={tr('Type a command')} title={tr('Type a command')} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-brand-700 shadow-panel ring-1 ring-brand-200 hover:bg-brand-50"><Keyboard size={19} /></button>
            <button onClick={() => setVoice({ muted: !v.muted })} aria-pressed={v.muted} aria-label={v.muted ? tr('Let the assistant speak') : tr('Silence the assistant')} title={v.muted ? tr('Let the assistant speak') : tr('Silence the assistant')} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-brand-700 shadow-panel ring-1 ring-brand-200 hover:bg-brand-50">{v.muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>
            <button onClick={() => stop()} aria-label={tr('Turn voice mode off')} title={tr('Turn voice mode off')} className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-red-600 shadow-panel ring-1 ring-red-200 hover:bg-red-50"><Power size={19} /></button>
          </div>
        )}
        <div className="flex flex-col items-center gap-1.5">
          <button data-voice-orb onClick={() => { if (v.status === 'speaking') interrupt(); else setVoice({ controls: !v.controls, settings: false }); }} aria-label={`${word}. ${v.status === 'speaking' ? tr('Tap to stop the voice') : tr('Tap for the voice controls')}`}
            className="relative rounded-full bg-gradient-to-br from-brand-900 to-ink-900 p-2.5 shadow-panel ring-2 ring-white/30 transition hover:scale-105">
            <VoiceOrb state={v.status === 'idle' ? 'idle' : v.status} level={v.level} size={86} caption={false} word={word} />
            {v.pending && <span aria-hidden className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-amber-400 text-xs font-bold text-ink-900 ring-2 ring-white">?</span>}
          </button>
          <p role="status" data-voice-status={v.status === 'listening' && v.hearing ? 'hearing' : v.status} className="rounded-full bg-surface/95 px-3 py-1 text-xs font-semibold text-brand-800 shadow-float ring-1 ring-brand-100">{word}</p>
        </div>
      </div>
    </div>
  );
}
