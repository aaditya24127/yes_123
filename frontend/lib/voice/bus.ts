'use client';
// How the voice assistant reaches into the pages. A page that can be controlled by voice registers a few named handlers (and a short description of what is on screen):
//     useVoicePage('visit', { fill: (p) => ..., start: () => ... }, () => ({ step: 2, ... }))
// The assistant then calls callPage('visit', 'fill', {...}); if the page is still opening after a navigation, the call waits for it.
import { useEffect, useRef } from 'react';

type Handler = (params: any) => unknown | Promise<unknown>;
interface Reg { call: (action: string, params: unknown) => unknown; state?: () => unknown; handlers: () => Record<string, Handler> }
const pages = new Map<string, Reg>();

export function useVoicePage(name: string, handlers: Record<string, Handler>, state?: () => unknown) {
  const h = useRef(handlers); h.current = handlers;
  const st = useRef(state); st.current = state;
  useEffect(() => {
    const reg: Reg = {
      handlers: () => h.current,
      call: (action, params) => { const fn = h.current[action]; if (!fn) throw new Error(`The ${name} page cannot do ${action}.`); return fn(params); },
      state: () => st.current?.(),
    };
    pages.set(name, reg);
    return () => { if (pages.get(name) === reg) pages.delete(name); };
  }, [name]);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function waitForPage(name: string, ms = 9000) {
  const end = Date.now() + ms;
  while (!pages.has(name) && Date.now() < end) await sleep(80);
  return pages.has(name);
}
export async function callPage(name: string, action: string, params: unknown = {}, ms = 9000) {
  if (!(await waitForPage(name, ms))) throw new Error('The page is not ready yet.');
  return pages.get(name)!.call(action, params);
}
/** What is on the screen now, as the pages describe it (sent to the assistant with every sentence). */
export function pageStates(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  pages.forEach((r, k) => { try { out[k] = r.state?.(); } catch { /* a page that cannot describe itself is left out */ } });
  return out;
}
