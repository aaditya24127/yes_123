'use client';
// The controller of the voice assistant: listens, sends each sentence to the assistant brain on the server, speaks the answer, carries out the actions and asks "Shall I go ahead?" before
// anything that changes something. One instance for the whole website (the React side only shows its state: components/voice).
import { api } from '@/lib/api';
import type { Directory } from '@/lib/types';
import { DEFS, findTheme, type Act, type Host } from './actions';
import { pageStates } from './bus';
import { ENGLISH_NAME, canRecognize, canRecord, canSpeak, hasVoiceFor, makeListener, speak, stopSpeaking, type Listener } from './speech';
import { addTurn, getVoice, loadVoicePrefs, setVoice } from './store';

void findTheme;
let host: Host | null = null;
let listener: Listener | null = null;
let history: { user: string; assistant: string }[] = [];
let lastReply = '';
let seq = 0;                                // every sentence gets a number: an answer that arrives after a newer sentence (or after "stop") is dropped
let dir: Directory | null = null;

/** The React side hands over what the controller needs (navigation, translation, language) on every render. */
export function bindHost(h: Omit<Host, 'dir'>) { host = { ...h, dir }; }
const H = (): Host => { if (!host) throw new Error('The voice assistant is not ready.'); return { ...host, dir }; };

// ---------------------------------------------------------------- words that mean yes / no / repeat / stop, per language (speech recognition gives them in the language's own script)
const YES = ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'confirm', 'confirmed', 'go ahead', 'do it', 'proceed', 'correct', 'right', 'please do', 'हाँ', 'हां', 'जी', 'ठीक है', 'कर दो', 'करो', 'कीजिए', 'हो', 'होय', 'ठीक आहे', 'करा', 'हो करा', 'হ্যাঁ', 'ঠিক আছে', 'করুন', 'అవును', 'సరే', 'ஆம்', 'சரி', 'હા', 'ઠીક છે', 'ہاں', 'جی', 'ٹھیک ہے', 'ಹೌದು', 'ಸರಿ', 'ହଁ', 'ଠିକ୍ ଅଛି', 'അതെ', 'ശരി'];
const NO = ['no', 'nope', 'cancel', 'dont', "don't", 'do not', 'stop', 'never mind', 'nevermind', 'wait', 'नहीं', 'ना', 'रुको', 'रद्द', 'नाही', 'नको', 'थांबा', 'না', 'থামুন', 'వద్దు', 'కాదు', 'இல்லை', 'வேண்டாம்', 'ના', 'નહીં', 'نہیں', 'نہ', 'ಇಲ್ಲ', 'ಬೇಡ', 'ନା', 'ଆଉ ନାହିଁ', 'ഇല്ല', 'വേണ്ട'];
const REPEAT = ['repeat', 'say that again', 'say again', 'again please', 'once more', 'what did you say', 'दोहराओ', 'फिर से बोलो', 'पुन्हा सांगा', 'पुन्हा बोला'];
const OFF = [/\b(stop|turn off|switch off|exit|close|end)\b.*\bvoice\b/, /\bvoice\b.*\b(off|stop|exit)\b/, /\b(goodbye|bye bye)\b/, /(आवाज|व्हॉइस|वॉइस).*(बंद)/];
const clean = (t: string) => t.toLowerCase().replace(/[.,!?;:।۔"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();
const isIn = (words: string[], t: string) => { const c = clean(t); return words.some((w) => c === w || c.startsWith(w + ' ') || (c.length < 22 && c.includes(' ' + w + ' ')) || (c.length < 22 && c.endsWith(' ' + w))); };

// ---------------------------------------------------------------- speaking and listening in turns
async function say(text: string, opts: { keepOpen?: boolean } = {}) {
  const v = getVoice(); if (!text.trim()) return;
  lastReply = text; addTurn({ who: 'assistant', text }); setVoice({ reply: text, status: 'speaking' });
  if (v.muted || !canSpeak()) { await new Promise((r) => setTimeout(r, Math.min(3500, 600 + text.length * 25))); }
  else { listener?.pause(); await speak(text, H().lang); }
  if (getVoice().on) { listener?.resume(); if (!opts.keepOpen) setVoice({ status: 'listening' }); }
}

export async function start(opts: { greet?: boolean } = {}) {
  if (getVoice().on) return;
  const h = H(); loadVoicePrefs();
  const mode = canRecognize() ? 'browser' : canRecord() ? 'whisper' : 'none';
  setVoice({ on: true, status: 'listening', error: '', heard: '', interim: '', doing: [], pending: null, open: true, support: { listen: mode !== 'none', speak: canSpeak(), mode } });
  api.directory().then((d) => { dir = d; }).catch(() => {});
  api.voice.warm().catch(() => {});                                // the server gets its view of the schools ready while the greeting is spoken
  if (mode === 'none') { setVoice({ error: h.tr('This browser cannot listen. Please use Chrome or Edge. You can still type to the assistant.') }); }
  else {
    listener = makeListener(h.lang, {
      onInterim: (t) => setVoice({ interim: t }),
      onFinal: (t) => { void onHeard(t); },
      onLevel: (v) => setVoice({ level: v }),
      onError: (e) => {
        const m = e === 'mic-denied' ? H().tr('The microphone is blocked. Allow the microphone for this website in the browser, then switch voice mode on again.') : e === 'no-mic' ? H().tr('No microphone was found.') : H().tr('The speech service cannot be reached. Check the internet.');
        setVoice({ error: m, status: 'idle' }); void say(m, { keepOpen: true });
      },
    });
    listener?.start();
  }
  if (opts.greet !== false) {
    const lang = h.lang; const nolang = !hasVoiceFor(lang) && lang !== 'en';
    let first = true; try { first = !localStorage.getItem('crp-voice-greeted'); localStorage.setItem('crp-voice-greeted', '1'); } catch { /* private window */ }
    await say(first
      ? h.tr('Welcome to CRP Mentor Copilot. Voice mode is on. Tell me what you want to do, for example: open the visit page, or: which school should I visit first? Say help to hear everything I can do.')
      : h.tr('Welcome to CRP Mentor Copilot. Voice mode is on. How can I help?')
      + (nolang ? ' ' + h.tr('Your device has no voice for this language, so the words are shown on screen too.') : ''));
  }
}

export function stop(opts: { quiet?: boolean } = {}) {
  seq++; stopSpeaking(); listener?.stop(); listener = null;
  setVoice({ on: false, status: 'idle', interim: '', level: 0, pending: null, doing: [] });
  if (!opts.quiet) { /* the panel shows that voice mode is off */ }
}
export const toggle = () => (getVoice().on ? stop() : start());
export function interrupt() { stopSpeaking(); if (getVoice().on) { listener?.resume(); setVoice({ status: 'listening' }); } }

// ---------------------------------------------------------------- one sentence
export async function onHeard(text: string) {
  const v = getVoice(); if (!v.on) return;
  const t = text.trim(); if (t.length < 2) return;
  setVoice({ heard: t, interim: '' }); addTurn({ who: 'you', text: t });
  const h = H();

  if (OFF.some((r) => r.test(clean(t)))) { await say(h.tr('Voice mode is off. Press Alt and V, or tap the circle, to switch it on again.'), { keepOpen: true }); stop(); return; }
  if (isIn(REPEAT, t) && lastReply) { await say(lastReply); return; }
  const p = v.pending;
  if (p) {
    if (isIn(YES, t)) { setVoice({ pending: null }); await runPending(p); return; }
    if (isIn(NO, t)) { setVoice({ pending: null, doing: [] }); await say(h.tr('Okay, I did not do it.')); return; }
    setVoice({ pending: null, doing: [] });                      // something else was said: that is a new request
  }
  await brain(t);
}

/** Types a command instead of speaking it (the box in the panel). */
export async function typed(text: string) { if (!getVoice().on) await start({ greet: false }); await onHeard(text); }

async function brain(t: string) {
  const my = ++seq; const h = H();
  stopSpeaking();                                                  // a new sentence replaces an answer that is still being read or worked out
  setVoice({ status: 'thinking', doing: [] });
  if (!dir) { try { dir = await api.directory(); } catch { /* the brain has its own copy */ } }
  try {
    const r = await api.voice.turn({
      utterance: t, language: ENGLISH_NAME[h.lang] ?? 'English', page: location.pathname + location.search,
      page_state: { screen: location.pathname, ...pageStates(), confirm_everything: getVoice().confirmAll }, history: history.slice(-6),
    });
    if (my !== seq || !getVoice().on) return;
    history = [...history, { user: t, assistant: r.say }].slice(-6);
    await plan(r.say, r.actions as Act[], my);
  } catch (e) {
    if (my !== seq) return;
    const m = (e as Error).message || '';
    await say(/waking|busy/i.test(m) ? h.tr('The server is waking up. Please say that again in a few seconds.') : h.tr('Sorry, I could not do that right now. Please try again.'));
  }
}

const needs = (a: Act) => { const d = DEFS[a.type]; return !d || d.risk === 'change' || (getVoice().confirmAll && a.type !== 'stop_voice'); };

async function plan(sayText: string, actions: Act[], my: number) {
  const h = H();
  const ok: Act[] = []; const problems: string[] = [];
  for (const a of actions) {                                         // unknown or impossible actions are not carried out; the CRP hears why
    const d = DEFS[a.type]; if (!d) continue;
    const bad = d.check?.(a, h); if (bad) { problems.push(h.tr(bad)); continue; }
    ok.push(a);
  }
  if (problems.length && !ok.length) { await say(problems[0]); return; }
  const i = ok.findIndex(needs);
  const now = i < 0 ? ok : ok.slice(0, i); const later = i < 0 ? [] : ok.slice(i);
  const speaking = sayText ? say(sayText + (later.length ? ' ' + h.tr('Shall I go ahead? Say yes or no.') : ''), { keepOpen: true }) : Promise.resolve();
  setVoice({ doing: ok.map((a) => DEFS[a.type].describe(a, h)) });
  for (const a of now) { try { await DEFS[a.type].run(a, H()); } catch (e) { problems.push(h.tr((e as Error).message)); } if (my !== seq) return; }
  if (later.length) {
    setVoice({ pending: { say: sayText, chips: later.map((a) => DEFS[a.type].describe(a, h)), run: async () => { for (const a of later) await DEFS[a.type].run(a, H()); } }, doing: later.map((a) => DEFS[a.type].describe(a, h)) });
  } else setTimeout(() => { if (!getVoice().pending) setVoice({ doing: [] }); }, 4000);
  await speaking;
  if (problems.length) await say(h.tr('Sorry: {why}', { why: problems[0] }));
  else if (getVoice().on && !getVoice().pending) setVoice({ status: 'listening' });
  if (getVoice().pending) setVoice({ status: 'listening' });
}

/** The CRP said yes (or tapped Confirm). */
export async function runPending(p = getVoice().pending) {
  if (!p) return; const h = H(); setVoice({ pending: null, status: 'thinking' });
  try { await p.run(); setVoice({ doing: [] }); await say(h.tr('Done.')); }
  catch (e) { setVoice({ doing: [] }); await say(h.tr('Sorry: {why}', { why: h.tr((e as Error).message) })); }
}
export async function cancelPending() { if (!getVoice().pending) return; setVoice({ pending: null, doing: [] }); await say(H().tr('Okay, I did not do it.')); }

