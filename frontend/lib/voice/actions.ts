'use client';
// What the voice assistant can DO on the website. The AI only describes an action ({type: 'visit_fill', school_id, ...}); this file checks it, describes it in plain words for the screen,
// says whether the CRP must confirm it first, and carries it out. "safe" actions (opening pages, changing what is shown, reading) run at once; "change" actions (saving, starting,
// sending, changing settings) wait for a spoken or tapped yes. The CRP can also ask to confirm everything.
import { api } from '@/lib/api';
import { session } from '@/lib/auth';
import { THEMES, saveTheme } from '@/lib/theme';
import type { Directory } from '@/lib/types';
import { LANGS, type Lang } from '@/lib/i18n';
import { callPage } from './bus';
import { clickControl, labelFor, needsYes, openDropdown, setField, type Choices } from './forms';
import { getVoice, setVoice } from './store';

export type Act = { type: string } & Record<string, any>;
export interface Host {
  nav: (path: string) => void; path: () => string; tr: (s: string, v?: Record<string, string | number>) => string;
  lang: string; setLang: (l: Lang) => void; turnOff: () => void; dir: Directory | null;
  say?: (text: string) => Promise<void>;           // speaks a line now (given by the controller)
  switchLanguage?: (code: string) => Promise<void>; // changes the language of the whole app, waits until its words are loaded, then answers in the new language
}
interface Def { risk: 'safe' | 'change'; confirm?: (a: Act) => boolean; describe: (a: Act, h: Host) => string; check?: (a: Act, h: Host) => string | null; run: (a: Act, h: Host) => Promise<void>; }

export const PAGE_PATH: Record<string, string> = { priorities: '/', upload: '/upload', visit: '/visit', teachers: '/connect', ask: '/ask', settings: '/settings' };
const PAGE_LABEL: Record<string, string> = { priorities: 'Priorities', upload: 'Upload', visit: 'Visit', teachers: 'Teachers', ask: 'Ask', settings: 'Settings' };
const LAYOUT_LABEL: Record<string, string> = { grid: 'Cards', vertical: 'One by one', horizontal: 'Sideways' };
const CODES = ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'gu', 'ur', 'kn', 'or', 'ml'];

const school = (h: Host, id?: string) => h.dir?.schools.find((s) => s.id === id);
const teacher = (h: Host, id?: string) => h.dir?.teachers.find((t) => t.id === id);
const who = (h: Host, a: Act) => (teacher(h, a.teacher_id)?.name ?? school(h, a.school_id)?.name ?? '');
const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9ऀ-෿ ]+/g, ' ').replace(/\s+/g, ' ').trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Goes to a page (unless already there) and waits for it to be ready to be controlled. */
async function goto(h: Host, page: string) {
  const want = PAGE_PATH[page]; const here = h.path().split('?')[0].replace(/\/$/, '') || '/';
  if (here !== want) { h.nav(want); await sleep(120); }
}

/** The chapter as the book writes it: "place value" becomes "Place value" when the school's book has such a chapter. */
async function officialChapter(h: Host, a: Act): Promise<string> {
  const topic = String(a.topic ?? '').trim(); if (!topic || !a.class_no || !a.subject) return topic;
  try {
    const c = await api.curriculum({ school_id: a.school_id ?? teacher(h, a.teacher_id)?.school_id, class_no: Number(a.class_no), subject: String(a.subject) });
    const all = c.books.flatMap((b) => b.chapters); const t = norm(topic);
    return all.find((x) => norm(x) === t) ?? all.find((x) => norm(x).includes(t) || t.includes(norm(x))) ?? topic;
  } catch { return topic; }
}

/** Reads six choices of the open dropdown aloud (from the n-th on) and remembers how far it got ("more" reads the next six). */
export async function readChoices(h: Host, c: Choices, from = 0) {
  const names = c.options.filter(Boolean); const batch = names.slice(from, from + 6); const rest = names.length - from - batch.length; const items = batch.join(', ');
  setVoice({ choices: { ...c, shown: from + batch.length } });
  await h.say?.(!names.length ? h.tr('The {name} list is empty.', { name: c.label })
    : !batch.length ? h.tr('That was the whole list. Which one?')
    : rest > 0 ? h.tr('{name}: {items}, and {n} more. Which one?', { name: c.label, items, n: rest })
    : h.tr('{name}: {items}. Which one?', { name: c.label, items }));
}

export const DEFS: Record<string, Def> = {
  navigate: {
    risk: 'safe', check: (a) => (PAGE_PATH[a.page] ? null : 'That page does not exist.'),
    describe: (a, h) => h.tr('Open the {page} page', { page: h.tr(PAGE_LABEL[a.page] ?? a.page) }),
    run: async (a, h) => { h.nav(PAGE_PATH[a.page]); },
  },
  priorities_view: {
    risk: 'safe', describe: (a, h) => h.tr('Show {what} on the priorities page', { what: [a.entity === 'teacher' ? h.tr('teachers') : a.entity === 'school' ? h.tr('schools') : '', a.filter && a.filter !== 'all' ? h.tr('{band} band', { band: a.filter }) : '', a.query ? `“${a.query}”` : ''].filter(Boolean).join(', ') || h.tr('the list') }),
    run: async (a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'view', a); },
  },
  open_item: {
    risk: 'safe', check: (a, h) => ((a.entity === 'teacher' ? teacher(h, a.id) : school(h, a.id)) ? null : 'I could not find that school or teacher.'),
    describe: (a, h) => h.tr('Open the details of {name}', { name: (a.entity === 'teacher' ? teacher(h, a.id)?.name : school(h, a.id)?.name) ?? '' }),
    run: async (a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'open', a); },
  },
  priorities_panel: {
    risk: 'safe', describe: (a, h) => (a.name === 'close' ? h.tr('Close the priorities panel') : h.tr('Open the priorities panel')),
    run: async (a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'panel', { open: a.name !== 'close' }); },
  },
  priority_weight: {
    risk: 'safe', check: (a) => (a.code && typeof a.weight === 'number' ? null : 'Which priority, and how important?'),
    describe: (a, h) => h.tr('Set the importance of “{code}” to {weight}', { code: a.code, weight: Math.round(a.weight) }),
    run: async (a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'weight', a); },
  },
  priorities_reset: {
    risk: 'safe', describe: (_a, h) => h.tr('Reset the priorities to the five main ones (not saved until you say save)'),
    run: async (_a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'reset', {}); },
  },
  priorities_save: {
    risk: 'change', describe: (_a, h) => h.tr('Save the priority settings'),
    run: async (_a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'save', {}); },
  },
  visit_fill: {
    risk: 'safe', check: (a, h) => (a.school_id || a.teacher_id ? ((a.school_id && !school(h, a.school_id)) || (a.teacher_id && !teacher(h, a.teacher_id)) ? 'I could not find that school or teacher.' : null) : 'Which school or teacher?'),
    describe: (a, h) => h.tr('Fill the visit: {who}{rest}', { who: who(h, a) || (school(h, teacher(h, a.teacher_id)?.school_id)?.name ?? ''), rest: [a.class_no ? h.tr(', class {n}', { n: a.class_no }) : '', a.subject ? `, ${a.subject}` : '', a.topic ? `, ${a.topic}` : ''].join('') }),
    run: async (a, h) => {
      const t = teacher(h, a.teacher_id); const topic = await officialChapter(h, { ...a, school_id: a.school_id ?? t?.school_id });
      h.nav('/visit'); await sleep(150);
      await callPage('visit', 'fill', { ...a, school_id: a.school_id ?? t?.school_id, topic });
    },
  },
  visit_start: {
    risk: 'safe', describe: (_a, h) => h.tr('Start the visit with what is filled in'),
    run: async (_a, h) => { await goto(h, 'visit'); await callPage('visit', 'start', {}); },
  },
  visit_step: {
    risk: 'safe', describe: (a, h) => h.tr('Go to the {step} step of the visit', { step: a.step === 'next' ? h.tr('next') : a.step === 'back' ? h.tr('previous') : String(a.step) }),
    run: async (a, h) => { await goto(h, 'visit'); await callPage('visit', 'step', a); },
  },
  visit_note: {
    risk: 'safe', check: (a) => (String(a.text ?? '').trim() ? null : 'What should the note say?'),
    describe: (a, h) => h.tr('Add this note to the visit: “{text}”', { text: String(a.text ?? '').slice(0, 140) }),
    run: async (a, h) => { await goto(h, 'visit'); await callPage('visit', 'note', a); },
  },
  assessment_start: {
    risk: 'change', check: (a, h) => (!teacher(h, a.teacher_id) ? 'Which teacher should be asked?' : !a.subject || !a.topic ? 'Which subject and chapter?' : null),
    describe: (a, h) => h.tr('Ask {name} for an assessment: {subject}, {topic}', { name: teacher(h, a.teacher_id)?.name ?? '', subject: a.subject ?? '', topic: a.topic ?? '' }),
    run: async (a, h) => {
      const t = teacher(h, a.teacher_id)!; const chapter = await officialChapter(h, { ...a, school_id: t.school_id });
      await api.assessments.start({ teacher_id: t.id, class_no: a.class_no ? Number(a.class_no) : (t.classes_taught[0] ?? null), subject: String(a.subject), chapter, question_count: Math.max(5, Math.min(10, Number(a.count) || 8)), ai_choice: 'auto' });
    },
  },
  settings_theme: {
    risk: 'safe', check: (a) => (findTheme(a.name) >= 0 ? null : 'I do not know that colour theme.'),
    describe: (a, h) => h.tr('Change the colours to {name}', { name: THEMES[findTheme(a.name)]?.name ?? a.name }),
    run: async (a) => { saveTheme(findTheme(a.name)); window.dispatchEvent(new Event('crp-voice-prefs')); },
  },
  settings_layout: {
    risk: 'safe', check: (a) => (LAYOUT_LABEL[a.layout] ? null : 'I do not know that layout.'),
    describe: (a, h) => h.tr('Change the priority list layout to {layout}', { layout: h.tr(LAYOUT_LABEL[a.layout] ?? a.layout) }),
    run: async (a) => { try { localStorage.setItem('crp-ui', a.layout); } catch { /* ignore */ } window.dispatchEvent(new Event('crp-voice-prefs')); },
  },
  settings_language: {
    risk: 'safe', check: (a) => (CODES.includes(a.language) ? null : a.language ? 'I do not know that language.' : 'Which language would you like? English, Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada, Odia or Malayalam?'),
    describe: (a, h) => h.tr('Change the language to {language}', { language: LANGS.find((l) => l.code === a.language)?.english ?? String(a.language) }),
    run: async (a, h) => { if (h.switchLanguage) await h.switchLanguage(a.language); else h.setLang(a.language as Lang); },
  },
  logout: {
    risk: 'change', describe: (_a, h) => h.tr('Sign out'),
    run: async (_a, h) => { try { await api.auth.logout(); } catch { /* signing out here is enough */ } h.turnOff(); session.clear(); h.nav('/login'); },
  },
  message_send: {
    risk: 'change', check: (a, h) => (!teacher(h, a.teacher_id) ? 'Which teacher?' : String(a.text ?? '').trim() ? null : 'What should the message say?'),
    describe: (a, h) => h.tr('Send a message to {name}: “{text}”', { name: teacher(h, a.teacher_id)?.name ?? '', text: String(a.text ?? '').slice(0, 140) }),
    run: async (a) => { await api.connect.send(String(a.teacher_id), String(a.text)); },
  },
  open_dropdown: {
    risk: 'safe', check: (a) => (a.control ? null : 'Which dropdown?'),
    describe: (a, h) => h.tr('Open the {name} list', { name: labelFor(a.control) }),
    run: async (a, h) => {
      const c = await openDropdown(a.control); setVoice({ choices: c });                            // the choices appear on screen ...
      await readChoices(h, c, Math.max(0, (parseInt(String(a.value ?? ''), 10) || 1) - 1));          // ... and are read aloud, six at a time (value = where to continue)
    },
  },
  set_field: {
    risk: 'safe', check: (a) => (!a.control ? 'Which field?' : !String(a.value ?? '').trim() ? 'What should I put there?' : null),
    describe: (a, h) => h.tr('Set {name} to “{value}”', { name: labelFor(a.control), value: String(a.value ?? '').slice(0, 80) }),
    run: async (a) => { await setField(a.control, a.value); setVoice({ choices: null }); },
  },
  click_button: {
    risk: 'safe', confirm: (a) => needsYes(a.control), check: (a) => (a.control ? null : 'Which button?'),
    describe: (a, h) => h.tr('Press “{name}”', { name: labelFor(a.control) }),
    run: async (a) => { await clickControl(a.control); },
  },
  voice_set: {
    risk: 'safe', check: (a) => (['gender', 'accent', 'speed', 'volume', 'silent', 'confirm_all'].includes(String(a.name)) ? null : 'I could not tell what to change about my voice.'),
    describe: (a, h) => h.tr('Change my voice: {what}', { what: `${String(a.name).replace('_', ' ')} ${String(a.value ?? '')}`.trim() }),
    run: async (a, h) => {
      const v = getVoice(); const name = String(a.name); const val = String(a.value ?? '').toLowerCase().trim(); const on = /^(on|yes|true|1|enable|enabled)$/.test(val);
      if (name === 'silent') {                                                                    // silent mode: say it first, then fall silent; when it ends, speak again
        if (on) { await h.say?.(h.tr('Silent mode is on. I will only listen and act.')); setVoice({ muted: true }); }
        else { setVoice({ muted: false }); await h.say?.(h.tr('I will speak again.')); }
        return;
      }
      if (name === 'confirm_all') { setVoice({ confirmAll: on }); await h.say?.(on ? h.tr('I will ask before every action.') : h.tr('I will not ask before every action, only before big ones.')); return; }
      const p = { ...v.voice };
      if (name === 'gender') p.gender = val === 'male' || val === 'female' ? val : (p.gender === 'male' ? 'female' : 'male');
      else if (name === 'accent') { const order = ['gb', 'us', 'in'] as const; const want = (['gb', 'us', 'in'] as const).find((k) => k === val) ?? order[(order.indexOf(p.accent) + 1) % 3]; p.accent = want; }
      else if (name === 'speed') {
        const num = Number(val.replace(',', '.'));
        p.rate = /^(slow|slower)/.test(val) ? Math.max(0.8, p.rate - 0.15) : /^(fast|faster|quick)/.test(val) ? Math.min(1.3, p.rate + 0.15) : /^(normal|usual|default|regular)/.test(val) ? 1 : Number.isFinite(num) && num > 0 ? Math.max(0.8, Math.min(1.3, num)) : p.rate;
        p.rate = Math.round(p.rate * 100) / 100;
      }
      else if (name === 'volume') {
        const num = Number(val.replace(',', '.')); const cur = p.volume ?? 1;
        p.volume = /^(loud|louder|up|higher|increase|raise)/.test(val) ? Math.min(1.6, cur + 0.25) : /^(quiet|quieter|soft|softer|low|lower|down|decrease|reduce)/.test(val) ? Math.max(0.3, cur - 0.25) : /^(normal|usual|default|regular)/.test(val) ? 1 : Number.isFinite(num) && num > 0 ? Math.max(0.3, Math.min(1.6, num)) : cur;
        p.volume = Math.round(p.volume * 100) / 100;
      }
      setVoice({ voice: p });
      await h.say?.(name === 'accent' && h.lang !== 'en' ? h.tr('The accent changes only my English voice. This is how I sound now.') : h.tr('This is how I sound now.'));
    },
  },
  stop_voice: { risk: 'safe', describe: (_a, h) => h.tr('Turn voice mode off'), run: async (_a, h) => { h.turnOff(); } },
};

export function findTheme(name: unknown): number {
  const n = norm(String(name ?? '')); if (!n) return -1;
  return THEMES.findIndex((t) => norm(t.name) === n) >= 0 ? THEMES.findIndex((t) => norm(t.name) === n) : THEMES.findIndex((t) => norm(t.name).includes(n) || n.includes(norm(t.name)));
}
