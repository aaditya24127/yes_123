'use client';
// Reads what is shown on the screen as plain text, for the voice assistant: it is sent with every sentence, so the assistant can answer "how many questions are there",
// "what does the third one say", "what is on the screen" and read any card, result or note aloud. It is the page as a person would read it, top to bottom: headings, lines, lists,
// what is typed in boxes. Dropdowns and buttons are listed separately (forms.ts), the voice screen itself and the menus are left out.
import { labelOf } from './forms';

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'TEMPLATE', 'CANVAS', 'AUDIO', 'VIDEO', 'IFRAME', 'OPTION', 'SELECT', 'PATH', 'NAV', 'HEADER']);
const SKIP_ATTR = '[data-voice-assistant], [data-voice-skip], [aria-hidden="true"], [hidden], [inert]';
const HEADINGS: Record<string, string> = { H1: '# ', H2: '## ', H3: '### ', H4: '### ', H5: '### ', H6: '### ' };

function root(): HTMLElement {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"]')).filter((d) => !d.closest('[data-voice-assistant]') && d.getClientRects().length);
  return dialogs[dialogs.length - 1] ?? document.querySelector<HTMLElement>('main') ?? document.body;       // an open dialog is what the CRP sees and works in
}

/** The text of the screen, one line per block, at most `max` characters. */
export function readScreen(max = 9000): string {
  const lines: string[] = []; let cur = ''; let size = 0; let full = false; const r = root();
  const flush = () => {
    const t = cur.replace(/\s+/g, ' ').trim(); cur = '';
    if (!t || full) return;
    if (lines.length && lines[lines.length - 1] === t) return;                      // the same line twice in a row (a label repeated by an icon or a tooltip)
    const line = t.length > 420 ? t.slice(0, 420) + '…' : t;
    if (size + line.length > max) { full = true; return; }
    lines.push(line); size += line.length + 1;
  };
  const walk = (n: Node) => {
    if (full) return;
    if (n.nodeType === Node.TEXT_NODE) { cur += n.textContent ?? ''; return; }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement; const tag = el.tagName.toUpperCase();
    if (SKIP_TAGS.has(tag) && el !== r) return;
    if (el.matches(SKIP_ATTR)) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {                                    // what is typed in a box is part of the screen (the notes, a search, a message)
      const t = (el as HTMLInputElement).type;
      if (['hidden', 'password', 'file', 'checkbox', 'radio', 'range', 'submit', 'button'].includes(t)) return;
      const v = (el as HTMLInputElement).value.trim();
      if (v) { flush(); cur = `${labelOf(el) || 'Box'}: ${v}`; flush(); }
      return;
    }
    const block = !cs.display.startsWith('inline') || tag === 'BR';
    if (block) flush();
    if (HEADINGS[tag]) cur += HEADINGS[tag];
    for (const c of Array.from(el.childNodes)) walk(c);
    if (block) flush();
  };
  for (const c of Array.from(r.childNodes)) walk(c);
  flush();
  return lines.join('\n') + (full ? '\n… (more below)' : '');
}
