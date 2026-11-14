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

export type Act = { type: string } & Record<string, any>;
export interface Host {
  nav: (path: string) => void; path: () => string; tr: (s: string, v?: Record<string, string | number>) => string;
  lang: string; setLang: (l: Lang) => void; turnOff: () => void; dir: Directory | null;
}
interface Def { risk: 'safe' | 'change'; describe: (a: Act, h: Host) => string; check?: (a: Act, h: Host) => string | null; run: (a: Act, h: Host) => Promise<void>; }

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
    risk: 'change', check: (a) => (a.code && typeof a.weight === 'number' ? null : 'Which priority, and how important?'),
    describe: (a, h) => h.tr('Set the importance of “{code}” to {weight}', { code: a.code, weight: Math.round(a.weight) }),
    run: async (a, h) => { await goto(h, 'priorities'); await callPage('priorities', 'weight', a); },
  },
  priorities_reset: {
    risk: 'change', describe: (_a, h) => h.tr('Reset the priorities to the five main ones (not saved until you say save)'),
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
    risk: 'change', describe: (_a, h) => h.tr('Start the visit with what is filled in'),
    run: async (_a, h) => { await goto(h, 'visit'); await callPage('visit', 'start', {}); },
  },
  visit_step: {
    risk: 'safe', describe: (a, h) => h.tr('Go to the {step} step of the visit', { step: a.step === 'next' ? h.tr('next') : a.step === 'back' ? h.tr('previous') : String(a.step) }),
    run: async (a, h) => { await goto(h, 'visit'); await callPage('visit', 'step', a); },
  },
  visit_note: {
    risk: 'change', check: (a) => (String(a.text ?? '').trim() ? null : 'What should the note say?'),
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
    risk: 'change', check: (a) => (findTheme(a.name) >= 0 ? null : 'I do not know that colour theme.'),
    describe: (a, h) => h.tr('Change the colours to {name}', { name: THEMES[findTheme(a.name)]?.name ?? a.name }),
    run: async (a) => { saveTheme(findTheme(a.name)); window.dispatchEvent(new Event('crp-voice-prefs')); },
  },
  settings_layout: {
    risk: 'change', check: (a) => (LAYOUT_LABEL[a.layout] ? null : 'I do not know that layout.'),
    describe: (a, h) => h.tr('Change the priority list layout to {layout}', { layout: h.tr(LAYOUT_LABEL[a.layout] ?? a.layout) }),
    run: async (a) => { try { localStorage.setItem('crp-ui', a.layout); } catch { /* ignore */ } window.dispatchEvent(new Event('crp-voice-prefs')); },
  },
  settings_language: {
    risk: 'change', check: (a) => (CODES.includes(a.language) ? null : 'I do not know that language.'),
    describe: (a, h) => h.tr('Change the language to {language}', { language: LANGS.find((l) => l.code === a.language)?.english ?? String(a.language) }),
    run: async (a, h) => { h.setLang(a.language as Lang); },
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
  stop_voice: { risk: 'safe', describe: (_a, h) => h.tr('Turn voice mode off'), run: async (_a, h) => { h.turnOff(); } },
};

export function findTheme(name: unknown): number {
  const n = norm(String(name ?? '')); if (!n) return -1;
  return THEMES.findIndex((t) => norm(t.name) === n) >= 0 ? THEMES.findIndex((t) => norm(t.name) === n) : THEMES.findIndex((t) => norm(t.name).includes(n) || n.includes(norm(t.name)));
}
