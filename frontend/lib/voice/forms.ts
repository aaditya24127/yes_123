'use client';
// The voice assistant's hands for forms: it reads the dropdowns, text boxes, check boxes and buttons that are on the screen (so the AI knows what can be filled), opens a dropdown
// (the choices are shown and read aloud), picks a choice, types into a box and presses a button. It works on any page because it uses the real elements of the page
// (every dropdown of the website is a normal <select>); the page does not need to prepare anything. Nothing here touches passwords or files.

export type Kind = 'select' | 'text' | 'textarea' | 'checkbox' | 'radio' | 'file' | 'button' | 'tab' | 'link';
export interface Control {
  n: number; kind: Kind; label: string; value: string; options: string[]; checked?: boolean; disabled: boolean; el: HTMLElement; toggle?: boolean;
}
export interface Choices { ref: string; label: string; options: string[]; current: string; shown?: number; }       // shown = how many choices were read aloud so far

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** How long a control is looked for before giving up: short for the first action of a sentence, long when an earlier action of the same sentence is still changing the page (a new page opens, a list fills). */
let patience = 2200;
export const setPatience = (ms: number) => { patience = ms; };
const text = (n: Node | null | undefined) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** Lower case, no punctuation, words separated by one space (Latin, Indian scripts and Arabic script are kept). */
export const norm = (x: unknown) => String(x ?? '').toLowerCase().replace(/[^a-z0-9ऀ-෿؀-ۿ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- what is on the screen
const SKIP_AREAS = '[data-voice-assistant], [data-voice-skip], nav, header, [aria-hidden="true"], [inert], [hidden]';       // data-voice-skip: has its own action (the visit steps)

function visible(el: HTMLElement): boolean {
  if (el.closest(SKIP_AREAS)) return false;
  if (!el.getClientRects().length) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

/** A box is named by its label, never by the text of its choices (a label that wraps a dropdown also contains the choices). */
function ownText(label: Element): string {
  const first = label.querySelector(':scope > span');
  if (first && text(first)) return text(first);
  const c = label.cloneNode(true) as Element;
  c.querySelectorAll('select, input, textarea, button, svg').forEach((x) => x.remove());
  return text(c);
}

export function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label'); if (aria?.trim()) return aria.trim();
  const by = el.getAttribute('aria-labelledby');
  if (by) { const t = by.split(/\s+/).map((id) => text(document.getElementById(id))).join(' ').trim(); if (t) return t; }
  if (el.id) { try { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l) return ownText(l); } catch { /* an odd id */ } }
  const wrap = el.closest('label'); if (wrap) { const t = ownText(wrap); if (t) return t; }
  return (el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('name') || '').trim();
}

function buttonLabel(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label'); if (aria?.trim()) return aria.trim();
  const c = el.cloneNode(true) as Element; c.querySelectorAll('svg, img').forEach((x) => x.remove());
  return text(c) || (el.getAttribute('title') ?? '').trim();
}

function root(): ParentNode {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter((d) => !d.closest('[data-voice-assistant]') && d.getClientRects().length);
  return dialogs[dialogs.length - 1] ?? document.querySelector('main') ?? document.body;     // an open dialog is the only thing that can be used right now
}

/** Everything the CRP could fill or press right now, in the order of the page. */
export function scan(): Control[] {
  const out: Control[] = [];
  root().querySelectorAll<HTMLElement>('select, input, textarea, button, a[href], [role="button"], [role="tab"], summary').forEach((el) => {
    if (!visible(el)) return;
    let kind: Kind; let value = ''; let options: string[] = []; let checked: boolean | undefined; let label = '';
    if (el instanceof HTMLSelectElement) {
      kind = 'select'; label = labelOf(el);
      options = Array.from(el.options).filter((o) => !(o.value === '' && /(…|\.\.\.)$/.test(text(o)))).map((o) => text(o)).filter((t) => t && t !== '—' && t !== '-');       // "Choose a school…" is a prompt, not a choice
      const s = el.selectedOptions[0]; value = s && s.value !== '' ? text(s) : '';
    } else if (el instanceof HTMLTextAreaElement) { kind = 'textarea'; label = labelOf(el); value = el.value; }
    else if (el instanceof HTMLInputElement) {
      const t = el.type;
      if (['hidden', 'password', 'range', 'submit', 'button', 'reset', 'image', 'color'].includes(t)) { if (!['submit', 'button'].includes(t)) return; }
      if (t === 'submit' || t === 'button') { kind = 'button'; label = el.value || labelOf(el); }
      else if (t === 'file') { kind = 'file'; label = labelOf(el) || 'Files'; }
      else if (t === 'checkbox') { kind = 'checkbox'; label = labelOf(el); checked = el.checked; }
      else if (t === 'radio') { kind = 'radio'; label = labelOf(el); checked = el.checked; }
      else { kind = 'text'; label = labelOf(el); value = el.value; }
    } else {
      label = buttonLabel(el);
      const role = el.getAttribute('role');
      kind = role === 'tab' ? 'tab' : el.tagName === 'A' ? 'link' : 'button';
      if (el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected')) { checked = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-selected') === 'true'; if (kind === 'button') kind = 'tab'; }
    }
    if (!label) return;
    const toggle = el.hasAttribute('aria-expanded') || el.hasAttribute('aria-pressed') || el.hasAttribute('aria-selected');
    out.push({ n: out.length + 1, kind, label: label.slice(0, 80), value, options, checked, disabled: (el as HTMLInputElement).disabled === true || el.getAttribute('aria-disabled') === 'true', el, toggle });
  });
  return out;
}

// What the AI was last shown, so that "control 3" still means the same control after the page changed a little (a dropdown that was filled in, a list that loaded).
let lastSnap: { n: number; kind: Kind; label: string }[] = [];

/** The screen as the AI sees it (a few hundred tokens: dropdowns with their choices, boxes with their values, the buttons). */
export function snapshot(): unknown[] {
  const all = scan(); const out: Record<string, unknown>[] = []; let budget = 7000; let selects = 0; const seen = new Map<string, number>();
  lastSnap = all.map((c) => ({ n: c.n, kind: c.kind, label: c.label }));
  for (const c of all) {
    if (out.length >= 48) break;
    const key = `${c.kind}:${norm(c.label)}`; const times = (seen.get(key) ?? 0) + 1; seen.set(key, times);
    if ((c.kind === 'button' || c.kind === 'link' || c.kind === 'tab') && times > 2) continue;           // the same button on every row of a list is not needed twice
    const o: Record<string, unknown> = { n: c.n, kind: c.kind, label: c.label };
    if (c.kind === 'select') {
      const cap = selects++ < 4 ? 60 : 14;
      o.value = c.value; o.options = c.options.slice(0, cap).map((t) => t.slice(0, 48)); if (c.options.length > cap) o.more = c.options.length - cap;
    } else if (c.kind === 'text' || c.kind === 'textarea') o.value = c.value.slice(0, 80);
    else if (c.checked !== undefined) o.checked = c.checked;
    if (c.disabled) o.disabled = true;
    const size = JSON.stringify(o).length; if (budget - size < 0) break; budget -= size; out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------- finding a control from what the AI named
function distance(a: string, b: string): number {
  if (a === b) return 0; if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
/** 1 = the same words, lower = looser; 0 = nothing in common. Misheard spellings (Vadgaon, Wadgaon) still match. */
function likeness(q: string, t: string): number {
  if (!q || !t) return 0; if (q === t) return 1;
  if (t.startsWith(q) || q.startsWith(t)) return 0.9;
  if (t.includes(q) || q.includes(t)) return 0.8;
  const qt = q.split(' ').filter((w) => w.length > 1); const tt = t.split(' ');
  if (!qt.length) return 0;
  const hit = qt.filter((w) => tt.some((x) => x === w || (w.length >= 5 && x.length >= 5 && distance(w, x) <= (w.length >= 8 ? 2 : 1)))).length;
  return hit === qt.length ? 0.7 : hit ? 0.3 + 0.3 * (hit / qt.length) : 0;
}

/** "3" / "#3" (the number the AI was shown) or the label of the control. */
export function findControl(ref: unknown, kinds?: Kind[]): Control | null {
  const r = String(ref ?? '').trim(); if (!r) return null;
  const all = scan(); const ok = (c: Control) => !kinds || kinds.includes(c.kind);
  const num = /^#?(\d{1,3})$/.exec(r);
  if (num) {
    const was = lastSnap.find((s) => s.n === Number(num[1]));
    if (was) {                                                         // the same control by its label (the k-th of that name), even if the page moved a little since
      const nth = lastSnap.filter((s) => s.kind === was.kind && norm(s.label) === norm(was.label)).findIndex((s) => s.n === was.n);
      const same = all.filter((c) => c.kind === was.kind && norm(c.label) === norm(was.label));
      const c = same[nth] ?? same[0];
      return c && ok(c) ? c : null;                                    // gone from the screen: never another control that now has the same number
    }
    const c = all[Number(num[1]) - 1]; return c && ok(c) ? c : null;
  }
  const q = norm(r); let best: Control | null = null; let bestScore = 0.45;
  for (const c of all) { if (!ok(c)) continue; const s = likeness(q, norm(c.label)); if (s > bestScore) { best = c; bestScore = s; } }
  return best;
}

/** The name to show for a control the AI named by its number. */
export function labelFor(ref: unknown): string {
  const r = String(ref ?? '').trim(); const num = /^#?(\d{1,3})$/.exec(r);
  if (num) { const s = lastSnap.find((x) => x.n === Number(num[1])); if (s) return s.label; }
  return r;
}

function matchOption(el: HTMLSelectElement, value: string): number {
  const q = norm(value); if (!q) return -1;
  let best = -1; let bestScore = 0.6;
  Array.from(el.options).forEach((o, i) => {
    const t = norm(o.textContent); if (!t) return;
    const s = Math.max(likeness(q, t), o.value && norm(o.value) === q ? 1 : 0);
    if (s > bestScore || (s === bestScore && s >= 0.9 && best >= 0 && t.length < norm(el.options[best].textContent).length)) { best = i; bestScore = s; }
  });
  return best;
}

// ---------------------------------------------------------------- doing things
/** Shows what the assistant touched: a ring around it for two seconds (and scrolls it into view). */
export function flash(el: HTMLElement) {
  try {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const old = { o: el.style.outline, f: el.style.outlineOffset };
    el.style.outline = ['3px', 'solid', 'rgb(var(--b500, 35 83 71))'].join(' '); el.style.outlineOffset = '2px';
    setTimeout(() => { el.style.outline = old.o; el.style.outlineOffset = old.f; }, 2200);
  } catch { /* not important */ }
}

/** The control is looked for again and again for a few seconds: a page that was just opened, or a dropdown that fills up after another was chosen, appears late. */
async function wait<T>(find: () => T | null, ms = patience): Promise<T | null> {
  const end = Date.now() + ms;
  for (;;) { const r = find(); if (r) return r; if (Date.now() > end) return null; await sleep(200); }
}

/** Opens a dropdown for the CRP: it is highlighted and its choices are returned (the screen lists them, the voice reads them). */
export async function openDropdown(ref: unknown): Promise<Choices> {
  const c = await wait(() => findControl(ref, ['select']));
  if (!c) throw new Error('I could not find that dropdown on this screen.');
  if (c.disabled) throw new Error('That list is not available yet. Choose the one before it first.');
  flash(c.el); try { c.el.focus({ preventScroll: true }); } catch { /* ignore */ }
  const options = (await wait(() => { const f = findControl(ref, ['select']); return f && f.options.length ? f.options : null; }, 3000)) ?? c.options;
  return { ref: c.label, label: c.label, options, current: c.value };       // found again by its label later (numbers may have changed by then)
}

/** Chooses an option in a dropdown, types into a box, or ticks a check box. Returns what it ended up as (the chosen option's text). */
export async function setField(ref: unknown, value: unknown): Promise<string> {
  const v = String(value ?? '');
  const c0 = await wait(() => findControl(ref, ['select', 'text', 'textarea', 'checkbox', 'radio', 'file']));
  if (!c0) throw new Error('I could not find that field on this screen.');
  if (c0.kind === 'file') throw new Error('Files cannot be chosen by voice. Please choose them by hand.');
  if (c0.disabled) throw new Error('That field is not available yet. Fill in the one before it first.');
  if (c0.kind === 'select') {
    // the choices may still be loading (a chapter list after the subject was chosen): look again for a few seconds
    const end = Date.now() + 5000; let c: Control | null = c0; let i = -1;
    for (;;) {
      c = findControl(ref, ['select']); if (c) i = matchOption(c.el as HTMLSelectElement, v);
      if (i >= 0 || Date.now() > end) break; await sleep(250);
    }
    if (!c || i < 0) throw new Error('That is not one of the choices in this list.');
    const el = c.el as HTMLSelectElement; flash(el);
    el.value = el.options[i].value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(300);                                                  // the page redraws (and fills the next dropdown)
    return text(el.options[i]);
  }
  const el = c0.el as HTMLInputElement | HTMLTextAreaElement; flash(el);
  if (c0.kind === 'checkbox' || c0.kind === 'radio') {
    const want = c0.kind === 'radio' ? true : !/^(off|no|false|untick|uncheck|unchecked|clear|remove)\b/i.test(v.trim());
    if ((el as HTMLInputElement).checked !== want) el.click();
    await sleep(200); return c0.label;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, v);                                  // the way React notices a typed value
  el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  await sleep(200); return v;
}

/** True when pressing this button needs a spoken yes first: only the big ones (sending something to a teacher, saving to the records, deleting, signing out), which are marked
 *  data-voice-confirm in the screens (every red "danger" button is marked by the Button component). Everything else is simply done. */
export function needsYes(ref: unknown): boolean {
  const c = findControl(ref, ['button', 'tab', 'link']);
  return !!c && !!c.el.closest('[data-voice-confirm]');
}

export async function clickControl(ref: unknown): Promise<string> {
  const c = await wait(() => findControl(ref, ['button', 'tab', 'link']));
  if (!c) throw new Error('I could not find that button on this screen.');
  if (c.disabled) throw new Error('That button is not available yet.');
  flash(c.el); await sleep(150); c.el.click(); await sleep(250);
  return c.label;
}

// "the second one", "number 3", "दुसरे निवडा", "तीसरा वाला": the place of a choice in the list as it is shown and read. English, Hindi and Marathi (digits in both scripts); other languages go to the AI.
const ORD: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  'पहला': 1, 'पहले': 1, 'पहली': 1, 'दूसरा': 2, 'दूसरे': 2, 'दूसरी': 2, 'तीसरा': 3, 'तीसरे': 3, 'तीसरी': 3, 'चौथा': 4, 'चौथे': 4, 'चौथी': 4, 'पाँचवाँ': 5, 'पांचवां': 5, 'पाँचवें': 5, 'पांचवें': 5, 'पांचवा': 5,
  'छठा': 6, 'छठे': 6, 'छठवां': 6, 'सातवाँ': 7, 'सातवां': 7, 'आठवाँ': 8, 'आठवां': 8, 'नौवाँ': 9, 'नौवां': 9, 'दसवाँ': 10, 'दसवां': 10,
  'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4, 'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'सात': 7, 'आठ': 8, 'नौ': 9, 'दस': 10,
  'पहिला': 1, 'पहिले': 1, 'पहिली': 1, 'दुसरा': 2, 'दुसरे': 2, 'दुसरी': 2, 'तिसरा': 3, 'तिसरे': 3, 'तिसरी': 3, 'पाचवा': 5, 'पाचवे': 5, 'पाचवी': 5, 'सहावा': 6, 'सहावे': 6, 'सहावी': 6, 'सातवा': 7, 'सातवे': 7,
  'आठवा': 8, 'नववा': 9, 'दहावा': 10, 'दोन': 2, 'पाच': 5, 'सहा': 6, 'नऊ': 9, 'दहा': 10,
};
const FILL = new Set(['the', 'one', 'ones', 'number', 'no', 'option', 'choice', 'item', 'please', 'select', 'choose', 'pick', 'take', 'i', 'want', 'will', 'वाला', 'वाली', 'वाले', 'चुनो', 'चुनिए', 'चुनें', 'चुनना', 'कीजिए', 'करो', 'को', 'का', 'की', 'नंबर', 'नम्बर', 'विकल्प', 'मुझे', 'चाहिए', 'दीजिए',
  'निवडा', 'निवड', 'करा', 'क्रमांक', 'पर्याय', 'तो', 'ते', 'ती', 'द्या', 'हवा', 'हवे', 'हवी', 'मला']);
const DEVA_DIGITS = '०१२३४५६७८९';
const digits = (t: string): number | undefined => (/^[0-9]{1,2}$/.test(t) ? Number(t) : /^[०-९]{1,2}$/.test(t) ? Number(t.replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)))) : undefined);
function ordinalOf(q: string): number {
  const toks = q.split(' ').filter(Boolean); if (!toks.length || toks.length > 5) return -1;
  const found: { t: string; n: number }[] = [];
  for (const t of toks) { const n = ORD[t] ?? digits(t); if (n !== undefined) found.push({ t, n }); else if (!FILL.has(t)) return -1; }     // any other word: it is not just a place
  const real = found.length > 1 ? found.filter((f) => f.t !== 'one' && f.t !== 'एक') : found;                                              // "the second one": the word one is filler next to another number
  const distinct = [...new Set(real.map((f) => f.n))];
  return distinct.length === 1 ? distinct[0] - 1 : -1;
}

/** The CRP named a choice of an open list: by its place ("2", "number 2", "the first one", "दुसरे निवडा") or by its words. Returns its index, or -1 (then the AI decides). */
export function pickByWords(options: string[], said: string): number {
  const q = norm(said); if (!q) return -1;
  const place = ordinalOf(q); if (place >= 0) return place < options.length ? place : -1;
  const exact = options.findIndex((t) => norm(t) === q); if (exact >= 0) return exact;
  const hits = options.map((t, i) => ({ i, s: likeness(q, norm(t)) })).filter((x) => x.s >= 0.9);
  return hits.length === 1 ? hits[0].i : -1;                                // only when it is clearly one choice
}
