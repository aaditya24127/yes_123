import type { Band } from './types';

export const BAND: Record<Band, { label: string; chip: string; ring: string; bar: string }> = {
  critical: { label: 'Critical', chip: 'bg-red-50 text-red-700 ring-red-200', ring: '#DC2626', bar: 'bg-red-500' },
  high: { label: 'High', chip: 'bg-orange-50 text-orange-700 ring-orange-200', ring: '#EA580C', bar: 'bg-orange-500' },
  medium: { label: 'Medium', chip: 'bg-brand-50 text-brand-700 ring-brand-200', ring: 'rgb(var(--b600))', bar: 'bg-brand-600' },
  low: { label: 'Low', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-200', ring: '#10A37F', bar: 'bg-emerald-500' },
};

// Factor colours: brand shades first, then calm accents; repeats when more than 10 factors are switched on.
const BASE_COLORS = ['rgb(var(--b800))', 'rgb(var(--b600))', 'rgb(var(--b500))', 'rgb(var(--b400))', 'rgb(var(--b300))', '#0F766E', '#7C3AED', '#B45309', '#BE185D', '#475569'];
export const CAT_COLORS = Array.from({ length: 40 }, (_, i) => BASE_COLORS[i % BASE_COLORS.length]);

export type Theme = { name: string; page: string; surface: string; ink: string[]; brand: string[] };
// Sun-switcher palettes. brand = shades 50..900 (light to dark; 600 carries white text), ink = text 900/700/500/400.
export const THEMES: Theme[] = [
  { name: 'Royal blue', page: '#F3F6FD', surface: '#FFFFFF', ink: ['#0B1B3F', '#33425F', '#64748B', '#94A3B8'],
    brand: ['#EFF5FF', '#DBE8FE', '#BFD5FD', '#93B8FB', '#5E92F7', '#3B73F0', '#2563EB', '#1E4FD0', '#1E40AF', '#1B3585'] },
  { name: 'Evergreen', page: '#EDF6EE', surface: '#FBFEFB', ink: ['#051F20', '#2F4B44', '#5F7A70', '#8EA699'],
    brand: ['#EEF7F0', '#DAF1DE', '#BCDCC4', '#8EB69B', '#5E9378', '#3A7260', '#235347', '#163832', '#0B2B26', '#051F20'] },
  { name: 'Deep teal', page: '#EAF3F6', surface: '#FBFEFE', ink: ['#05161A', '#294D61', '#5B7C8D', '#8FA9B6'],
    brand: ['#EAF5F7', '#D3E8EE', '#B0D3E0', '#6DA5C0', '#2E9AA3', '#0F969C', '#0C7075', '#0A5258', '#072E33', '#05161A'] },
  { name: 'Plum', page: '#FBF1EB', surface: '#FFFCFA', ink: ['#190019', '#3F2A4F', '#7A6178', '#A892A6'],
    brand: ['#FBEFEA', '#FBE4D8', '#EDCDC6', '#DFB6B2', '#A8687F', '#854F6C', '#522B5B', '#3A1B58', '#2B124C', '#190019'] },
  { name: 'Crimson dusk', page: '#FBF3EF', surface: '#FFFCFA', ink: ['#161E2F', '#384358', '#6A7487', '#9BA3B2'],
    brand: ['#FDF0EC', '#FFE1D5', '#FFC8B2', '#FFA586', '#E5675A', '#CF3A42', '#B51A2B', '#8A1B30', '#541A2E', '#2E1228'] },
  { name: 'Fiery ocean', page: '#FBF4E6', surface: '#FFFDF8', ink: ['#001A2A', '#1F4A63', '#5C7F96', '#9DB5C4'],
    brand: ['#EEF4F8', '#DCE9F1', '#BDD5E4', '#9DC0D6', '#669BBC', '#2F6C92', '#003049', '#00263A', '#001C2B', '#001220'] },
  { name: 'Burgundy sand', page: '#F6EFE4', surface: '#FDFAF5', ink: ['#2A0A10', '#5A3A3F', '#8A6F68', '#B3A08F'],
    brand: ['#F8F1E9', '#F0E4D3', '#E3D2BB', '#D0BBA0', '#A66A6C', '#7C2F3B', '#560E1B', '#450B16', '#340811', '#24050C'] },
  { name: 'Papyrus', page: '#F2F0EC', surface: '#FBFAF8', ink: ['#1E2228', '#3D434C', '#77726E', '#A29E99'],
    brand: ['#F6F2EE', '#ECEAE8', '#CACBCD', '#B3B9C1', '#8C9099', '#5C626B', '#323841', '#292E36', '#20242B', '#171A20'] },
];

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
export function applyTheme(i: number) {
  const t = THEMES[i] ?? THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--page', rgb(t.page));
  r.setProperty('--surface', rgb(t.surface));
  [900, 700, 500, 400].forEach((k, n) => r.setProperty(`--i${k}`, rgb(t.ink[n])));
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].forEach((k, n) => r.setProperty(`--b${k}`, rgb(t.brand[n])));
}

export const FEED_LABEL: Record<string, string> = {
  learning_gap: 'Learning gaps', unresolved_issue: 'Unresolved issues', recurring_need: 'Recurring needs', overdue_followup: 'Follow-ups',
  time_since_visit: 'Visits', attendance: 'Attendance',
};

export const SECTION_LABEL: Record<string, string> = {
  assessments: 'Assessments', observations: 'Observations', followups: 'Follow-ups', visits: 'Visits', attendance: 'Attendance', audio: 'Audio recordings', roster: 'Roster', other: 'Other',
};
