// One place for the app's high-level layout: menu, pages and feature switches.
// To add a page: create app/<path>/page.tsx using <PageShell>, then add it to NAV below. To hide a feature, set it to false in FEATURES.
import { Home, Upload, ClipboardCheck, MessagesSquare, Settings, type LucideIcon } from 'lucide-react';
import type { Key } from './i18n';

export const APP = { name: 'CRP Mentor Copilot', short: 'C' };

// End-user build (the APK / iOS app CRPs install): set NEXT_PUBLIC_END_USER=1 when building. Admin-only screens are hidden;
// everything technical (AI keys, AI choice, database) stays on the server, so people who install the app set up nothing.
export const END_USER_BUILD = process.env.NEXT_PUBLIC_END_USER === '1';

export const FEATURES = {
  aiAdmin: !END_USER_BUILD, // AI providers, connection test and AI cost on the Settings page
  upload: true,          // bulk upload + automatic sorting
  visit: true,           // 4-step visit evaluation
  connect: true,         // CRP <-> teacher requests, messages (teachers use the separate teacher-app)
  customFactors: true,   // CRP can create factors (and add the data for them)
  overrides: true,       // pin / move / hold a school or teacher by hand
  textbooks: true,       // textbook search + link to teacher
  ask: true,             // "Ask the copilot" box
};

export type NavItem = { href: string; label: Key; icon: LucideIcon; feature?: keyof typeof FEATURES };
export const NAV: NavItem[] = [
  { href: '/', label: 'nav_priorities', icon: Home },
  { href: '/upload', label: 'nav_upload', icon: Upload, feature: 'upload' },
  { href: '/visit', label: 'nav_visit', icon: ClipboardCheck, feature: 'visit' },
  { href: '/connect', label: 'nav_connect', icon: MessagesSquare, feature: 'connect' },
  { href: '/settings', label: 'nav_settings', icon: Settings },
];

// Kinds of things a CRP can ask a teacher for (labels come from the backend too; this is the order shown).
export const REQUEST_KINDS = ['visit_notice', 'marks', 'attendance', 'syllabus_plan', 'lesson_plan', 'lesson_recording', 'student_work', 'reflection', 'other'] as const;

// Document types used by the upload sorter (must match backend SECTIONS).
export const SECTIONS = ['assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'facts', 'textbooks', 'other'] as const;

// How often background work is checked (milliseconds).
export const POLL_MS = 2500;
