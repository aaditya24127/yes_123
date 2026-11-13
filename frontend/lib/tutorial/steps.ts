// The tutorial, step by step. Each step points at one thing on the screen (a data-tour marker), shows a short line of text and says a
// friendlier spoken line. The words live in lib/tutorial/lang/<language>.json under the step's id; the voice files in
// public/tutorial/voice/<language>/<id>.mp3 (made by tools/make_tutorial_voice.py).
//
// To add a step: add it here, add its words to lang/en.json (and the other languages), then run the voice tool.

export type ChapterId = 'priorities' | 'visit' | 'files' | 'teachers' | 'ask' | 'weights' | 'settings';

export interface Step {
  id: string;
  chapter: ChapterId;
  /** The page this step belongs to ('*' = any page). */
  path: string;
  /** What to highlight: a CSS selector; the first one that is on screen wins. No target = only the banner. */
  target?: string;
  /** Show the tapping hand: the person has to tap the target themselves. */
  point?: boolean;
  /** How the step ends: the Next button, something appearing / going away, a page opening, or a value being chosen. */
  advance: 'next' | 'appear' | 'gone' | 'route' | 'value' | 'finish';
  /** For 'appear' / 'gone': the selector to watch. For 'route': the page that must open. */
  when?: string;
  /** Also offer the Next button on a step that waits for something (the action is optional). */
  canSkip?: boolean;
  /** The step is already done when this is on screen (or, starting with '/', when this page is open): go straight on. */
  skipIf?: string;
  /** If the target never shows up, go on by itself instead of waiting (for things that are not always there). */
  optional?: boolean;
  /** This must be on screen for the step to make sense; if it is not, go back to step `back`. */
  needs?: string;
  back?: string;
}

const m = (name: string) => `[data-tour="${name}"]`;
// Markers that tell where a visit already is, so the guide can catch up when the person is ahead of it.
const RESULTS = `${m('res-wait')}, ${m('res-short')}, ${m('res-empty')}`;
const AFTER_CLASS = `${m('v-questions')}, ${RESULTS}`;
const IN_VISIT = `${m('v-record')}, ${AFTER_CLASS}`;

export const STEPS: Step[] = [
  // ------------------------------------------------------------ the priority list
  { id: 'welcome', chapter: 'priorities', path: '*', advance: 'next' },
  { id: 'home_cards', chapter: 'priorities', path: '/', target: m('card'), advance: 'next' },
  { id: 'home_score', chapter: 'priorities', path: '/', target: m('card-score'), advance: 'next' },
  { id: 'home_reasons', chapter: 'priorities', path: '/', target: m('card-facts'), advance: 'next' },
  { id: 'home_switch', chapter: 'priorities', path: '/', target: m('entity-switch'), advance: 'next' },
  { id: 'home_filters', chapter: 'priorities', path: '/', target: m('band-filters'), advance: 'next' },
  { id: 'home_open', chapter: 'priorities', path: '/', target: m('card'), point: true, advance: 'appear', when: m('detail-tabs') },
  { id: 'detail_evidence', chapter: 'priorities', path: '/', target: m('evidence'), advance: 'next', needs: m('detail-tabs'), back: 'home_open' },
  { id: 'detail_eye', chapter: 'priorities', path: '/', target: m('evidence-file'), point: true, advance: 'appear', when: m('file-viewer'), canSkip: true, optional: true, needs: m('detail-tabs'), back: 'home_open' },
  { id: 'detail_file', chapter: 'priorities', path: '/', target: m('file-viewer'), advance: 'next', optional: true, needs: m('detail-tabs'), back: 'home_open' },
  { id: 'detail_visit', chapter: 'priorities', path: '/', target: m('detail-visit'), point: true, advance: 'route', when: '/visit', needs: m('detail-tabs'), back: 'home_open' },

  // ------------------------------------------------------------ a school visit (4 steps)
  { id: 'visit_nav', chapter: 'visit', path: '*', target: m('nav-visit'), point: true, advance: 'route', when: '/visit', skipIf: '/visit' },
  { id: 'visit_who', chapter: 'visit', path: '/visit', target: m('v-who'), advance: 'appear', when: `${m('v-today')}, ${IN_VISIT}`, skipIf: `${m('v-today')}, ${IN_VISIT}` },
  { id: 'visit_steps', chapter: 'visit', path: '/visit', target: m('stepper'), advance: 'next' },
  { id: 'visit_teacher', chapter: 'visit', path: '/visit', target: m('v-teacher'), advance: 'value', canSkip: true, optional: true, skipIf: IN_VISIT },
  { id: 'visit_class', chapter: 'visit', path: '/visit', target: m('v-today'), advance: 'next', optional: true, skipIf: IN_VISIT },
  { id: 'visit_brief', chapter: 'visit', path: '/visit', target: m('v-brief'), advance: 'next', optional: true, skipIf: IN_VISIT },
  { id: 'visit_history', chapter: 'visit', path: '/visit', target: m('v-history'), advance: 'next', optional: true, skipIf: IN_VISIT },
  { id: 'visit_start', chapter: 'visit', path: '/visit', target: m('v-start'), point: true, advance: 'appear', when: IN_VISIT, skipIf: IN_VISIT },
  { id: 'class_record', chapter: 'visit', path: '/visit', target: m('v-record'), advance: 'next', skipIf: AFTER_CLASS, needs: m('stepper'), back: 'visit_who' },
  { id: 'class_notes', chapter: 'visit', path: '/visit', target: m('v-notes'), advance: 'next', skipIf: AFTER_CLASS, needs: m('stepper'), back: 'visit_who' },
  { id: 'class_next', chapter: 'visit', path: '/visit', target: m('v-next-students'), point: true, advance: 'appear', when: AFTER_CLASS, skipIf: AFTER_CLASS, needs: m('stepper'), back: 'visit_who' },
  { id: 'students_get', chapter: 'visit', path: '/visit', target: m('v-get-questions'), point: true, advance: 'appear', when: m('v-question-item'), canSkip: true, skipIf: RESULTS, needs: m('stepper'), back: 'visit_who' },
  { id: 'students_record', chapter: 'visit', path: '/visit', target: m('v-question-item'), advance: 'next', optional: true, skipIf: RESULTS, needs: m('stepper'), back: 'visit_who' },
  { id: 'students_next', chapter: 'visit', path: '/visit', target: m('v-next-results'), point: true, advance: 'appear', when: RESULTS, skipIf: RESULTS, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_wait', chapter: 'visit', path: '/visit', target: m('res-wait'), advance: 'appear', when: m('res-short'), skipIf: m('res-short'), optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_short', chapter: 'visit', path: '/visit', target: m('res-short'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_well', chapter: 'visit', path: '/visit', target: m('res-well'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_improve', chapter: 'visit', path: '/visit', target: m('res-improve'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_steps', chapter: 'visit', path: '/visit', target: m('res-steps'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_followup', chapter: 'visit', path: '/visit', target: m('res-followup'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_report', chapter: 'visit', path: '/visit', target: m('res-report'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },
  { id: 'results_save', chapter: 'visit', path: '/visit', target: m('res-save'), advance: 'next', optional: true, needs: m('stepper'), back: 'visit_who' },

  // ------------------------------------------------------------ adding files
  { id: 'nav_upload', chapter: 'files', path: '*', target: m('nav-upload'), point: true, advance: 'route', when: '/upload', skipIf: '/upload' },
  { id: 'upload_what', chapter: 'files', path: '/upload', target: m('u-what'), advance: 'next' },
  { id: 'upload_drop', chapter: 'files', path: '/upload', target: m('u-drop'), advance: 'next' },

  // ------------------------------------------------------------ teachers
  { id: 'nav_teachers', chapter: 'teachers', path: '*', target: m('nav-connect'), point: true, advance: 'route', when: '/connect', skipIf: '/connect' },
  { id: 'teachers_pick', chapter: 'teachers', path: '/connect', target: m('t-item'), point: true, advance: 'appear', when: m('t-tasks'), skipIf: m('t-tasks') },
  { id: 'teachers_tasks', chapter: 'teachers', path: '/connect', target: m('t-tasks'), advance: 'next', needs: m('t-tasks'), back: 'teachers_pick' },
  { id: 'teachers_messages', chapter: 'teachers', path: '/connect', target: m('t-messages'), advance: 'next', needs: m('t-tasks'), back: 'teachers_pick' },
  { id: 'teachers_review', chapter: 'teachers', path: '/connect', target: m('t-review'), advance: 'next', needs: m('t-tasks'), back: 'teachers_pick' },

  // ------------------------------------------------------------ asking a question
  { id: 'nav_ask', chapter: 'ask', path: '*', target: m('nav-ask'), point: true, advance: 'route', when: '/ask', skipIf: '/ask' },
  { id: 'ask_box', chapter: 'ask', path: '/ask', target: m('a-card'), advance: 'next' },

  // ------------------------------------------------------------ what matters to you (the P button)
  { id: 'nav_home', chapter: 'weights', path: '*', target: m('nav-home'), point: true, advance: 'route', when: '/', skipIf: '/' },
  { id: 'prio_open', chapter: 'weights', path: '/', target: m('prio-button'), point: true, advance: 'appear', when: m('prio-panel'), skipIf: m('prio-panel') },
  { id: 'prio_sliders', chapter: 'weights', path: '/', target: m('prio-sliders'), advance: 'next', needs: m('prio-panel'), back: 'prio_open' },
  { id: 'prio_save', chapter: 'weights', path: '/', target: m('prio-actions'), advance: 'next', needs: m('prio-panel'), back: 'prio_open' },
  { id: 'prio_close', chapter: 'weights', path: '/', target: m('prio-close'), point: true, advance: 'gone', when: m('prio-panel') },

  // ------------------------------------------------------------ settings, and the end
  { id: 'nav_settings', chapter: 'settings', path: '*', target: m('nav-settings'), point: true, advance: 'route', when: '/settings', skipIf: '/settings' },
  { id: 'settings_look', chapter: 'settings', path: '/settings', target: m('s-colours'), advance: 'next' },
  { id: 'settings_language', chapter: 'settings', path: '/settings', target: m('s-language'), advance: 'next' },
  { id: 'finish', chapter: 'settings', path: '*', target: m('tutorial-toggle'), advance: 'finish' },
];

export const CHAPTERS: ChapterId[] = ['priorities', 'visit', 'files', 'teachers', 'ask', 'weights', 'settings'];
export const indexOfStep = (id: string) => Math.max(0, STEPS.findIndex((s) => s.id === id));
export const firstOfChapter = (c: ChapterId) => Math.max(0, STEPS.findIndex((s) => s.chapter === c));
