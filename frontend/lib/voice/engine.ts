'use client';
// The controller of the voice assistant (one instance for the whole website; the React side only shows its state: components/voice).
//   ear (ear.ts)  -> a spoken sentence as a small WAV -> the server turns it into words (POST /api/voice/hear)
//   -> the assistant brain on the server (POST /api/voice/turn) answers with what to SAY and what to DO
//   -> the natural voice speaks it (tts.ts) while the actions are carried out on the page (actions.ts) -> "Shall I go ahead?" first for anything that changes something.
// While the assistant speaks, the ear is paused (it would hear itself). A new sentence always replaces one that is still being worked on.
import { api } from '@/lib/api';
import { session } from '@/lib/auth';
import type { Directory } from '@/lib/types';
import { DEFS, readChoices, type Act, type Host } from './actions';
import { pageStates } from './bus';
import { pickByWords, setField, setPatience, snapshot, type Choices } from './forms';
import { readScreen } from './screen';
import { Ear, type EarError } from './ear';
import { ENGLISH_NAME, canRecognize, makeListener, type Listener } from './speech';
import { addDebug } from './debug';
import { LANGS, type Lang } from '@/lib/i18n';
import { getVoice, loadVoicePrefs, setVoice } from './store';
import { outputLevel, prefetch, speakNatural, stopNatural, unlockAudio } from './tts';

let host: Host | null = null;
let ear: Ear | null = null;
let browserEar: Listener | null = null;       // the browser's own recognition: only used if the speech service keeps failing
let history: { user: string; assistant: string }[] = [];
let lastReply = '';
let seq = 0;                                  // every sentence gets a number: an answer that arrives after a newer sentence (or after "stop") is dropped
let gen = 0;                                  // bumped by "stop talking": spoken things still waiting in the queue are dropped
let chain: Promise<unknown> = Promise.resolve();
let dir: Directory | null = null;
let hearFails = 0; let micRetries = 0; let lastHearAt = 0; let warnedSilent = false; let talking = false;

/** The React side hands over what the controller needs (navigation, translation, language) on every render. */
export function bindHost(h: Omit<Host, 'dir'>) { host = { ...h, dir }; }
const H = (): Host => { if (!host) throw new Error('The voice assistant is not ready.'); return { ...host, dir, say: (t: string) => say(t), switchLanguage }; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// How the CRP is addressed (sir / madam, in the language's own script): in the greeting, in the goodbye and now and then in between, never in every answer.
const ADDRESS: Record<string, [string, string]> = { en: ['sir', 'madam'], hi: ['सर', 'मैडम'], mr: ['सर', 'मॅडम'], bn: ['স্যার', 'ম্যাডাম'], te: ['సార్', 'మేడం'], ta: ['சார்', 'மேடம்'], gu: ['સર', 'મેડમ'], ur: ['سر', 'میڈم'], kn: ['ಸರ್', 'ಮೇಡಂ'], or: ['ସାର୍', 'ମ୍ୟାଡାମ୍'], ml: ['സർ', 'മാഡം'] };
const callThem = (lang: string) => { const s = session.user()?.salutation; return !s ? '' : (ADDRESS[lang] ?? ADDRESS.en)[s === 'maam' ? 1 : 0]; };
let sinceAddress = 0;                                                  // answers since the word was last used
/** The word for this answer, or '' (most of the time): after four answers there is a small chance, after seven it is certain (about once in six answers). */
function addressThisTime(lang: string): string {
  sinceAddress++;
  if (sinceAddress < 7 && !(sinceAddress >= 4 && Math.random() < 0.2)) return '';
  sinceAddress = 0; return callThem(lang);
}

// ---------------------------------------------------------------- words that mean yes / no / repeat / stop, per language (written in each language's own script)
const YES = ['yes', 'yeah', 'yep', 'yup', 'sure', 'ok', 'okay', 'confirm', 'confirmed', 'go ahead', 'do it', 'proceed', 'correct', 'right', 'please do', 'हाँ', 'हां', 'जी', 'ठीक है', 'कर दो', 'करो', 'कीजिए', 'हो', 'होय', 'ठीक आहे', 'करा', 'हो करा', 'হ্যাঁ', 'ঠিক আছে', 'করুন', 'అవును', 'సరే', 'ஆம்', 'சரி', 'હા', 'ઠીક છે', 'ہاں', 'جی', 'ٹھیک ہے', 'ಹೌದು', 'ಸರಿ', 'ହଁ', 'ଠିକ୍ ଅଛି', 'അതെ', 'ശരി'];
const NO = ['no', 'nope', 'cancel', 'dont', "don't", 'do not', 'stop', 'never mind', 'nevermind', 'wait', 'नहीं', 'ना', 'रुको', 'रद्द', 'नाही', 'नको', 'थांबा', 'না', 'থামুন', 'వద్దు', 'కాదు', 'இல்லை', 'வேண்டாம்', 'ના', 'નહીં', 'نہیں', 'نہ', 'ಇಲ್ಲ', 'ಬೇಡ', 'ନା', 'ଆଉ ନାହିଁ', 'ഇല്ല', 'വേണ്ട'];
const MORE = ['more', 'next', 'next ones', 'the rest', 'rest', 'read more', 'read the rest', 'go on', 'continue', 'what else', 'the others', 'others', 'और', 'और बताओ', 'आगे', 'आगे बताओ', 'बाकी', 'बाकी बताओ', 'अगला', 'आणखी', 'अजून', 'अजून सांगा', 'पुढे', 'पुढचे', 'बाकीचे', 'আরও', 'পরের', 'বাকি', 'ఇంకా', 'మిగతావి', 'తరువాత', 'மேலும்', 'மற்றவை', 'அடுத்து', 'વધુ', 'બાકી', 'આગળ', 'اور', 'باقی', 'آگے', 'ಇನ್ನಷ್ಟು', 'ಉಳಿದ', 'ಮುಂದೆ', 'ଆଉ', 'ବାକି', 'ଆଗକୁ', 'കൂടുതൽ', 'ബാക്കി', 'അടുത്തത്'];
const REPEAT = ['repeat', 'say that again', 'say again', 'again please', 'once more', 'what did you say', 'दोहराओ', 'फिर से बोलो', 'पुन्हा सांगा', 'पुन्हा बोला'];
const OFF = [/\b(stop|turn off|switch off|exit|close|end)\b.*\bvoice\b/, /\bvoice\b.*\b(off|stop|exit)\b/, /\b(goodbye|bye bye)\b/, /(आवाज|आवाज़|व्हॉइस|वॉइस|वॉयस).*(बंद|बन्द|थांबवा|रोको|स्टॉप)/, /(स्टॉप|बंद|बन्द|थांबवा).*(व्हॉइस|वॉइस|वॉयस|आवाज|आवाज़)/];
const clean = (t: string) => t.toLowerCase().replace(/[.,!?;:।۔"'“”]+/g, ' ').replace(/\s+/g, ' ').trim();
const isIn = (words: string[], t: string) => { const c = clean(t); return words.some((w) => c === w || c.startsWith(w + ' ') || (c.length < 22 && c.includes(' ' + w + ' ')) || (c.length < 22 && c.endsWith(' ' + w))); };

// The names of the 11 languages as people say them (English letters and each language's own script): after "Which language would you like?" the answer is understood on the device.
const LANG_WORDS: Record<string, string[]> = {
  en: ['english', 'inglish', 'इंग्रजी', 'अंग्रेजी', 'अंग्रेज़ी', 'इंग्लिश', 'ইংরেজি', 'ఇంగ్లీష్', 'ஆங்கிலம்', 'અંગ્રેજી', 'انگریزی', 'ಇಂಗ್ಲಿಷ್', 'ଇଂରାଜୀ', 'ഇംഗ്ലീഷ്'],
  hi: ['hindi', 'हिंदी', 'हिन्दी', 'ہندی', 'হিন্দি', 'హిందీ', 'இந்தி', 'હિન્દી', 'ಹಿಂದಿ', 'ହିନ୍ଦୀ', 'ഹിന്ദി'],
  mr: ['marathi', 'मराठी', 'মারাঠি', 'మరాఠీ', 'மராத்தி', 'મરાઠી', 'مراٹھی', 'ಮರಾಠಿ', 'ମରାଠୀ', 'മറാത്തി'],
  bn: ['bengali', 'bangla', 'बंगाली', 'बांग्ला', 'বাংলা', 'বাঙালি', 'బెంగాలీ', 'வங்காளம்', 'બંગાળી', 'بنگالی', 'ಬಂಗಾಳಿ', 'ବଙ୍ଗାଳୀ', 'ബംഗാളി'],
  te: ['telugu', 'तेलुगू', 'तेलुगु', 'তেলুগু', 'తెలుగు', 'தெலுங்கு', 'તેલુગુ', 'تیلگو', 'ತೆಲುಗು', 'ତେଲୁଗୁ', 'തെലുങ്ക്'],
  ta: ['tamil', 'तमिल', 'तमिळ', 'তামিল', 'తమిళం', 'தமிழ்', 'તમિલ', 'تمل', 'ತಮಿಳು', 'ତାମିଲ', 'തമിഴ്'],
  gu: ['gujarati', 'गुजराती', 'গুজরাটি', 'గుజరాతీ', 'குஜராத்தி', 'ગુજરાતી', 'گجراتی', 'ಗುಜರಾತಿ', 'ଗୁଜରାଟୀ', 'ഗുജറാത്തി'],
  ur: ['urdu', 'उर्दू', 'উর্দু', 'ఉర్దూ', 'உருது', 'ઉર્દુ', 'اردو', 'ಉರ್ದು', 'ଉର୍ଦ୍ଦୁ', 'ഉറുദു'],
  kn: ['kannada', 'कन्नड', 'কন্নড়', 'కన్నడ', 'கன்னடம்', 'કન્નડ', 'کنڑ', 'ಕನ್ನಡ', 'କନ୍ନଡ', 'കന്നഡ'],
  or: ['odia', 'oriya', 'ओडिया', 'उड़िया', 'ওড়িয়া', 'ఒడియా', 'ஒடியா', 'ઓડિયા', 'اڑیہ', 'ಒಡಿಯಾ', 'ଓଡ଼ିଆ', 'ഒഡിയ'],
  ml: ['malayalam', 'मलयालम', 'मल्याळम', 'মালয়ালম', 'మలయాళం', 'மலையாளம்', 'મલયાલમ', 'ملیالم', 'ಮಲಯಾಳಂ', 'ମଳୟାଳମ', 'മലയാളം'],
};
const LANG_FILL = new Set(['please', 'in', 'to', 'the', 'language', 'speak', 'switch', 'change', 'use', 'say', 'talk', 'set', 'भाषा', 'मध्ये', 'में', 'करा', 'करो', 'लावा', 'लगाओ', 'बोला', 'बोलो', 'चुनो', 'निवडा', 'कृपया']);
function languageFromWords(text: string): string | null {
  const q = clean(text).split(' ').filter((w) => w && !LANG_FILL.has(w));
  if (q.length !== 1) return null;
  const hit = Object.entries(LANG_WORDS).find(([, names]) => names.some((n) => n === q[0]));
  return hit ? hit[0] : null;
}
// "Change your language" without a name: the assistant itself asks which one (the AI used to answer "the language is already Marathi" or to ask for a yes).
const LANGUAGE_WORD = ['language', 'bhasha', 'भाषा', 'ভাষা', 'భాష', 'மொழி', 'ભાષા', 'زبان', 'ಭಾಷೆ', 'ଭାଷା', 'ഭാഷ'];
const CHANGE_WORD = ['change', 'switch', 'select', 'choose', 'pick', 'another', 'different', 'बदल', 'निवड', 'चुन', 'বদল', 'మార్', 'மாற்', 'બદલ', 'بدل', 'ಬದಲ', 'ବଦଳ', 'മാറ്റ'];
function asksForLanguageChange(text: string): boolean {
  const toks = clean(text).split(' ').filter(Boolean);
  if (!toks.length || toks.length > 8) return false;
  const named = toks.some((w) => Object.values(LANG_WORDS).some((n) => n.includes(w)));
  return !named && toks.some((w) => LANGUAGE_WORD.includes(w)) && toks.some((w) => CHANGE_WORD.some((c) => w.startsWith(c)));
}
let awaitingLanguage = 0;                                              // when the assistant asked "which language?" (the next sentence may be just the name)

// ---------------------------------------------------------------- speaking (one thing at a time, in order)
function say(text: string, opts: { skip?: () => boolean } = {}): Promise<void> {
  const t = text.trim(); if (!t) return Promise.resolve();
  const my = gen;
  const job = chain.then(async () => {
    if (my !== gen || !getVoice().on || opts.skip?.()) return;
    lastReply = t; setVoice({ reply: t }); addDebug('say', t);
    const v = getVoice();
    if (v.muted) { await sleep(Math.min(2500, 500 + t.length * 18)); return; }
    talking = true; ear?.pause(); browserEar?.pause();
    const timer = setInterval(() => setVoice({ level: outputLevel() }), 60);
    let guard: ReturnType<typeof setTimeout> | null = null;
    const limit = new Promise<void>((res) => { guard = setTimeout(() => { addDebug('speak-timeout', t.slice(0, 60)); stopNatural(); res(); }, 8000 + t.length * 110); });       // whatever goes wrong with the sound, the queue moves on
    try { await Promise.race([speakNatural(t, H().lang, v.voice, () => { if (my === gen && getVoice().on) setVoice({ status: 'speaking' }); }), limit]); }
    finally { if (guard) clearTimeout(guard); clearInterval(timer); setVoice({ level: 0 }); talking = false; }
    await sleep(240);                                                // let the last echo of the voice die away before listening again
    if (my === gen && getVoice().on) { ear?.resume(); browserEar?.resume(); if (!getVoice().pending || true) setVoice({ status: 'listening' }); }
  });
  chain = job.catch(() => {});
  return job.catch(() => {});
}

/** "Switch to Marathi": the whole app changes language; the words of the new language load a moment later, so the confirmation is spoken only when they are there (in the new voice). */
async function switchLanguage(code: string) {
  host?.setLang(code as Lang);
  const end = Date.now() + 3500;
  for (;;) { const n = H(); if ((n.lang === code && (code === 'en' || n.tr('Done.') !== 'Done.')) || Date.now() > end) break; await sleep(100); }
  const n = H();
  await say(n.tr('Language changed to {language}.', { language: LANGS.find((l) => l.code === code)?.native ?? code }));
}

// ---------------------------------------------------------------- switching voice mode on and off
export async function start(opts: { greet?: boolean } = {}) {
  if (getVoice().on) return;
  unlockAudio();                                                      // sound is allowed from this click / key press on
  const h = H(); loadVoicePrefs();
  gen++; seq++; hearFails = 0; micRetries = 0; warnedSilent = false;
  sinceAddress = 0;
  setVoice({ on: true, status: 'listening', error: '', heard: '', doing: [], pending: null, choices: null, controls: false, settings: false, support: { listen: true, speak: true, mode: 'ear' } });
  api.directory().then((d) => { dir = d; }).catch(() => {});
  api.voice.warm().catch(() => {});                                   // the server gets its view of the schools ready while the greeting is spoken
  let first = true; try { first = !localStorage.getItem('crp-voice-greeted'); localStorage.setItem('crp-voice-greeted', '1'); } catch { /* private window */ }
  const who = callThem(h.lang);
  const greeting = (opts.greet === false) ? '' : first
    ? (who ? h.tr('Welcome to CRP Mentor Copilot, {who}. Voice mode is on. Tell me what you want to do, for example: open the visit page, or: which school should I visit first?', { who })
           : h.tr('Welcome to CRP Mentor Copilot. Voice mode is on. Tell me what you want to do, for example: open the visit page, or: which school should I visit first?'))
    : (who ? h.tr('Welcome back, {who}. How can I help?', { who }) : h.tr('Welcome to CRP Mentor Copilot. How can I help?'));
  if (greeting) prefetch(greeting, h.lang, getVoice().voice);
  prefetch(h.tr('One moment.'), h.lang, getVoice().voice);
  const mic = startEar();                                             // asks for the microphone now (the browser's question appears while the greeting is spoken)
  if (greeting) { void mic; await say(greeting); } else { await mic; ear?.resume(); setVoice({ status: 'listening' }); }
}

async function startEar() {
  const v = getVoice();
  ear = new Ear({
    deviceId: v.micId || undefined,
    onLevel: (l) => { if (getVoice().status === 'listening' || getVoice().status === 'idle') setVoice({ level: l }); },
    onSpeaking: (on) => { setVoice({ hearing: on }); addDebug('vad', on ? 'speech starts' : 'speech ends'); },
    onUtterance: (wav, sec) => { addDebug('utterance', `${sec.toFixed(1)}s ${Math.round(wav.size / 1000)}KB`); void onUtterance(wav); },
    onError: (e) => { void earProblem(e); },
  });
  await ear.start();
  if (talking) ear.pause();                                           // the microphone was allowed while the assistant is speaking: it must not hear that
  setVoice({ micLabel: ear.label });
}

async function earProblem(e: EarError) {
  const h = H(); addDebug('ear-error', e);
  if (e === 'mic-silent') { if (warnedSilent) return; warnedSilent = true; }        // said once: a muted microphone does not need to be announced again and again
  if (e === 'mic-lost' && micRetries < 3 && getVoice().on) { micRetries++; ear?.stop(); await sleep(800); await startEar(); return; }     // a microphone that was unplugged or woke up late
  const m = e === 'mic-denied' ? h.tr('The microphone is blocked. Allow the microphone for this website in the browser, then switch voice mode on again.')
    : e === 'no-mic' ? h.tr('No microphone was found.') : e === 'mic-silent' ? h.tr('Your microphone seems to be muted. Check its switch or choose another microphone in the settings.')
    : h.tr('The microphone stopped working.');
  setVoice({ error: m, status: 'idle', settings: e !== 'mic-denied' });
  if (e !== 'mic-denied') void say(m);
}

export function stop() {
  seq++; gen++; stopNatural(); ear?.stop(); ear = null; browserEar?.stop(); browserEar = null; clearFiller();
  setVoice({ on: false, status: 'idle', hearing: false, level: 0, pending: null, choices: null, doing: [], controls: false, settings: false, typing: false });
}
export const toggle = () => (getVoice().on ? stop() : start());
/** Esc or a tap on the circle while it speaks: it stops talking and listens. */
export function interrupt() { gen++; stopNatural(); clearFiller(); if (getVoice().on) { ear?.resume(); browserEar?.resume(); setVoice({ status: 'listening', level: 0 }); } }

export async function setMic(id: string) { setVoice({ micId: id }); if (getVoice().on) { ear?.stop(); await startEar(); } }
export function earState() { return ear?.state ?? null; }
/** The settings sheet: hear how the assistant sounds with the chosen voice. */
export async function previewVoice() { unlockAudio(); const h = H(); ear?.pause(); await say(h.tr('Welcome to CRP Mentor Copilot. This is how I sound.')); }

// ---------------------------------------------------------------- one spoken sentence
async function onUtterance(wav: Blob) {
  if (!getVoice().on) { addDebug('utterance-dropped', 'voice mode is off'); return; }
  const my = ++seq; const h = H();
  stopNatural(); gen++; clearFiller();                                // speaking over the assistant: it stops
  setVoice({ status: 'thinking', doing: [] });
  let text = '';
  try { text = (await api.voice.hear(wav, h.lang)).text.trim(); hearFails = 0; lastHearAt = Date.now(); }
  catch (e) {
    addDebug('hear-error', (e as Error).message);
    if (my !== seq) return;
    if (++hearFails >= 3) { await useBrowserEar(); return; }
    setVoice({ status: 'listening' }); return;
  }
  if (my !== seq || !getVoice().on) return;
  if (!text) { addDebug('hear-empty', 'nothing real was said'); setVoice({ status: 'listening' }); return; }
  await onHeard(text, my);
}

/** The speech service keeps failing: fall back to the browser's own recognition (Chrome / Edge) so the assistant can still hear. */
async function useBrowserEar() {
  const h = H(); ear?.stop(); ear = null;
  if (!canRecognize()) { setVoice({ error: h.tr('The speech service cannot be reached. Check the internet, then switch voice mode on again.'), status: 'idle' }); return; }
  setVoice({ support: { listen: true, speak: true, mode: 'browser' }, status: 'listening' });
  browserEar = makeListener(h.lang, { onInterim: () => {}, onFinal: (t) => { void onHeard(t, ++seq); }, onLevel: (l) => setVoice({ level: l }), onError: () => setVoice({ error: H().tr('The speech service cannot be reached. Check the internet, then switch voice mode on again.'), status: 'idle' }) });
  browserEar?.start();
}

export async function onHeard(text: string, mySeq = ++seq) {
  const v = getVoice(); if (!v.on) return;
  const t = text.trim(); if (t.length < 2) return;
  setVoice({ heard: t, status: 'thinking' }); addDebug('heard', t);
  const h = H();

  if (OFF.some((r) => r.test(clean(t)))) { const who = callThem(h.lang); await say(who ? h.tr('Voice mode is off. Goodbye, {who}.', { who }) : h.tr('Voice mode is off.')); stop(); return; }
  if (isIn(REPEAT, t) && lastReply) { await say(lastReply); return; }
  const p = v.pending;
  if (p) {
    if (isIn(YES, t)) { setVoice({ pending: null }); await runPending(p); return; }
    if (isIn(NO, t)) { setVoice({ pending: null, doing: [] }); await say(h.tr('Okay, I did not do it.')); return; }
    setVoice({ pending: null, doing: [] });                          // something else was said: that is a new request
  }
  if (awaitingLanguage && Date.now() - awaitingLanguage < 45000) {                // "Which language?" was asked: a bare language name is the answer
    const code = languageFromWords(t);
    awaitingLanguage = 0;
    if (code) { await switchLanguage(code); return; }
  }
  if (asksForLanguageChange(t)) {
    awaitingLanguage = Date.now();
    const q = h.tr('Which language would you like? English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia or Malayalam?');
    history = [...history, { user: t, assistant: q }].slice(-6); await say(q); return;
  }
  const ch = v.choices;
  if (ch) {                                                          // a dropdown is open: the CRP names one of its choices (or says no)
    if (isIn(NO, t)) { setVoice({ choices: null }); await say(h.tr('Okay.')); return; }
    if (isIn(MORE, t)) { await readChoices(H(), ch, ch.shown ?? 0); return; }
    const i = pickByWords(ch.options, t);
    if (i >= 0) { await choose(ch, i); return; }
  }
  await brain(t, mySeq);
}

/** A choice of the open dropdown was picked (spoken, or tapped on the screen). */
async function choose(ch: Choices, i: number) {
  const h = H(); const name = ch.options[i]; if (name === undefined) return;
  setVoice({ status: 'thinking' });
  try { const got = await setField(ch.ref, name); setVoice({ choices: null }); await say(h.tr('Selected {value}.', { value: got.replace(/[\s.?!\u0964]+$/, '') })); }
  catch (e) { await say(h.tr((e as Error).message)); }
}
export async function chooseOption(i: number) { const ch = getVoice().choices; if (ch) await choose(ch, i); }

/** Types a command instead of speaking it (the one-line box). */
export async function typed(text: string) { if (!getVoice().on) await start({ greet: false }); await onHeard(text); }

// ---------------------------------------------------------------- the brain
let fillerTimer: ReturnType<typeof setTimeout> | null = null; let answered = false; let fillerN = 0;
function clearFiller() { if (fillerTimer) clearTimeout(fillerTimer); fillerTimer = null; answered = true; }

async function brain(t: string, my: number) {
  const h = H();
  answered = false;
  fillerTimer = setTimeout(() => { if (!answered && my === seq) { void say(fillerN++ % 2 ? h.tr('Right away.') : h.tr('One moment.'), { skip: () => answered }); } }, 2800);   // a short spoken "one moment" only if the answer really takes a while (an answer usually comes in about two seconds)
  if (!dir) { try { dir = await api.directory(); } catch { /* the brain has its own copy */ } }
  try {
    const vp = getVoice();
    const ps = { screen: location.pathname, assistant: { language: ENGLISH_NAME[h.lang] ?? 'English', voice: vp.voice.gender, accent: vp.voice.accent, speed: vp.voice.rate, volume: vp.voice.volume ?? 1, silentMode: vp.muted, askBeforeEveryAction: vp.confirmAll },
      ...pageStates(), screen_text: readScreen(), controls: snapshot(),
      choices_open: getVoice().choices ? { control: getVoice().choices!.label, options: getVoice().choices!.options.slice(0, 40).map((text, i) => ({ n: i + 1, text })) } : undefined, confirm_everything: getVoice().confirmAll };
    addDebug('screen_text', ps.screen_text); addDebug('state', JSON.stringify(ps).length); addDebug('page_state', ps);
    const r = await api.voice.turn({ utterance: t, language: ENGLISH_NAME[h.lang] ?? 'English', address: addressThisTime(h.lang), page: location.pathname + location.search, page_state: ps, history: history.slice(-6) });
    answered = true; if (fillerTimer) clearTimeout(fillerTimer);
    if (my !== seq || !getVoice().on) return;
    history = [...history, { user: t, assistant: r.say }].slice(-6); addDebug('brain', `${r.took}s ${r.say}`); addDebug('actions', JSON.stringify(r.actions));
    const before = lastReply;
    await plan(r.say, r.actions as Act[], my);
    if (lastReply && lastReply !== before && history.length) history[history.length - 1] = { ...history[history.length - 1], assistant: lastReply };      // the history holds what was really said (a list read aloud, an error), not only what the AI wrote
  } catch (e) {
    answered = true; if (fillerTimer) clearTimeout(fillerTimer);
    if (my !== seq) return;
    const m = (e as Error).message || ''; addDebug('brain-error', m);
    await say(/waking|busy/i.test(m) ? h.tr('The server is waking up. Please say that again in a few seconds.') : h.tr('Sorry, I could not do that right now. Please try again.'));
  }
}

const FORM_ACTIONS = ['set_field', 'click_button', 'open_dropdown'];
// The CRP can always change how the assistant behaves (voice_set), also to stop it asking.
const needs = (a: Act) => { const d = DEFS[a.type]; if (!d || (getVoice().confirmAll && a.type !== 'stop_voice' && a.type !== 'voice_set')) return true; return d.confirm ? d.confirm(a) : d.risk === 'change'; };

async function plan(sayText: string, actions: Act[], my: number) {
  const h = H();
  if (actions.some((a) => a.type === 'open_dropdown' || a.type === 'settings_language' || a.type === 'voice_set')) sayText = '';       // opening a list is answered by reading its choices, a new language by a line in that language: not by a sentence of the AI
  const ok: Act[] = []; const problems: string[] = [];
  for (const a of actions) {                                         // unknown or impossible actions are not carried out; the CRP hears why
    const d = DEFS[a.type]; if (!d) continue;
    const bad = d.check?.(a, h); if (bad) { problems.push(h.tr(bad)); continue; }
    ok.push(a);
  }
  if (problems.length && !ok.length) {
    if (actions.some((a) => a.type === 'settings_language' && !a.language)) awaitingLanguage = Date.now();
    await say(problems[0]); if (history.length) history[history.length - 1] = { ...history[history.length - 1], assistant: problems[0] }; return;
  }
  const i = ok.findIndex(needs);
  const now = i < 0 ? ok : ok.slice(0, i); const later = i < 0 ? [] : ok.slice(i);
  const speakIt = () => (sayText ? say(sayText + (later.length ? ' ' + h.tr('Shall I go ahead?') : '')) : Promise.resolve());
  const formy = now.some((a) => FORM_ACTIONS.includes(a.type));                       // filling a form can fail: the answer is spoken only once it is known to be true
  let speaking = formy ? Promise.resolve() : speakIt();
  setVoice({ doing: ok.map((a) => DEFS[a.type].describe(a, h)) });
  let first = true;
  for (const a of now) { setPatience(first ? 2200 : 7000); first = false; try { await DEFS[a.type].run(a, H()); } catch (e) { problems.push(h.tr((e as Error).message)); } if (my !== seq) return; if (a.type === 'set_field' || a.type === 'click_button') await sleep(200); }
  if (formy) { if (problems.length && !later.length) { setVoice({ doing: [] }); await say(h.tr('Sorry: {why}', { why: problems[0] })); return; } speaking = speakIt(); }
  if (later.length) {
    setVoice({ pending: { say: sayText, chips: later.map((a) => DEFS[a.type].describe(a, h)), run: async () => { for (const a of later) await DEFS[a.type].run(a, H()); } }, doing: later.map((a) => DEFS[a.type].describe(a, h)) });
  } else setTimeout(() => { if (!getVoice().pending) setVoice({ doing: [] }); }, 3500);
  await speaking;
  if (problems.length) await say(h.tr('Sorry: {why}', { why: problems[0] }));
  if (!sayText && !problems.length && !later.length) setVoice({ status: 'listening' });
}

/** The CRP said yes (or tapped the button). */
export async function runPending(p = getVoice().pending) {
  if (!p) return; const h = H(); setVoice({ pending: null, status: 'thinking' });
  try { await p.run(); setVoice({ doing: [] }); await say(H().tr('Done.')); }
  catch (e) { setVoice({ doing: [] }); await say(h.tr('Sorry: {why}', { why: h.tr((e as Error).message) })); }
}
export async function cancelPending() { if (!getVoice().pending) return; setVoice({ pending: null, doing: [] }); await say(H().tr('Okay, I did not do it.')); }

void lastHearAt;
