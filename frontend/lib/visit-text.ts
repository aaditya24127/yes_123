// Small helpers that turn the visit texts into short points, in plain words (shared by the visit screens).
import { localeNow } from './i18n';

/** Split a paragraph into short points. */
export function sentences(text: string | null | undefined, limit = 5): string[] {
  const parts = (text ?? '').split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);
  // "Mrs. Jadhav" or "St. Mary's" is not the end of a sentence: join the pieces back
  const out: string[] = [];
  for (const p of parts) {
    if (out.length && /(?:^|\s)(?:Mr|Mrs|Ms|Dr|Prof|Sri|Shri|Smt|St|No|vs|etc)\.$/.test(out[out.length - 1])) out[out.length - 1] += ' ' + p; else out.push(p);
  }
  return out.slice(0, limit);
}

/** "[O1] spoken English (minor): In Mr. ..." becomes "spoken English". */
export const issueName = (o: { label?: string; issue: string }) => o.label || o.issue.replace(/^\[O\d+\]\s*/, '').replace(/\s*\(.*$/, '').trim();
/** The same, keeping the sentence that explains it. */
export const issueText = (issue: string) => issue.replace(/^\[O\d+\]\s*/, '').trim();

export const PRACTICE: Record<string, string> = {
  'A1 Supportive learning environment': 'Friendly, supportive classroom', 'A2 Positive behavioural expectations': 'Clear and positive rules for behaviour',
  'Time on task': 'Time spent on learning', 'B1 Lesson facilitation': 'Clear explanation of the lesson', 'B2 Checks for understanding': 'Checking that students understand',
  'B3 Feedback': 'Feedback to students', 'B4 Critical thinking': 'Making students think', 'C1 Autonomy': 'Students taking charge of their learning',
  'C2 Perseverance': 'Students not giving up', 'C3 Social and collaborative skills': 'Students working together',
};
export const SCORE_WORD: Record<number, string> = { 1: 'Needs a lot of work', 2: 'Needs work', 3: 'Fair', 4: 'Good', 5: 'Very good' };

export const BAND_WORD: Record<string, string> = { critical: 'Visit first', high: 'Visit soon', medium: 'Visit when you can', low: 'No hurry' };

export const fmtDay = (iso: string | Date) => new Date(iso).toLocaleDateString(localeNow(), { day: 'numeric', month: 'short', year: 'numeric' });
export const todayIso = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

/** Address of the visit screen for a school or teacher card ("Visit" button). */
export const visitHref = (item: { entity: string; id: string; school_id: string }) =>
  item.entity === 'teacher' ? `/visit?school=${item.school_id}&teacher=${item.id}` : `/visit?school=${item.id}`;
