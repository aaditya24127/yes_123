// Everything that differs between "website" and "phone app" (Android / iOS via Capacitor) lives here, so the pages stay the same.
//
//   NEXT_PUBLIC_API_BASE  where the backend is. Empty on the website (same address, forwarded by next.config.mjs);
//                         a full address in the app, e.g. https://api.example.in
//   NEXT_PUBLIC_WEB_URL   the public website address, used for links that are sent to people (teacher links).
//                         Empty = the address this page was opened from.

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');
const WEB_URL = (process.env.NEXT_PUBLIC_WEB_URL ?? '').replace(/\/$/, '');

/** True inside the Android / iOS app shell. */
export function isApp(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return !!w.Capacitor?.isNativePlatform?.();
}

/** Full address for a backend path like /api/config. */
export const apiUrl = (path: string) => `${API_BASE}${path}`;

/** Address to share with someone else (they open it in a normal browser). */
export function shareUrl(path: string): string {
  if (WEB_URL) return `${WEB_URL}${path}`;
  return typeof window !== 'undefined' && !isApp() ? `${window.location.origin}${path}` : path;
}

/** Open a web page or file outside the app view. In the app this can later use @capacitor/browser; today a new window/tab. */
export function openExternal(url: string) {
  const w = window as unknown as { Capacitor?: { Plugins?: { Browser?: { open: (o: { url: string }) => Promise<void> } } } };
  const browser = isApp() ? w.Capacitor?.Plugins?.Browser : undefined;
  if (browser) { browser.open({ url }); return; }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** Copy text; falls back to a prompt where the clipboard is not allowed (some app web views). */
export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { window.prompt('Copy this:', text); return false; }
}
