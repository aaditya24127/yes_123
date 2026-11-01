'use client';
// Page frame: logo, bell, menu (bottom bar on phones, top bar on bigger screens) and the "offline" note.
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CalendarCheck, ClipboardList, MessageCircle, UserRound, WifiOff } from 'lucide-react';
import type { Home } from '@/lib/api';

const NAV = [
  { href: '/', label: 'Tasks', icon: ClipboardList },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/visits', label: 'Visits', icon: CalendarCheck },
  { href: '/account', label: 'Me', icon: UserRound },
];

export default function Shell({ home, error, children }: { home: Home | null; error?: string; children: ReactNode }) {
  const path = usePathname();
  const open = home?.tasks.filter((t) => t.status === 'open').length ?? 0;
  const unreadMsgs = home?.messages.filter((m) => m.sender !== 'teacher' && !m.read_at).length ?? 0;
  const badge = (href: string) => (href === '/' ? open : href === '/messages' ? unreadMsgs : 0);
  const on = (href: string) => (href === '/' ? path === '/' || path.startsWith('/task') : path.startsWith(href));

  return (
    <div className="mx-auto max-w-3xl px-4">
      <header className="sticky top-0 z-30 -mx-4 flex items-center gap-3 bg-gradient-to-b from-page via-page/95 to-transparent px-4 pb-3 pt-4">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white shadow-float">C</div>
          <div className="leading-tight">
            <p className="font-serif text-lg font-semibold tracking-tight text-ink-900">CRP Mentor Copilot</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">Teacher</p>
          </div>
        </Link>
        <nav className="ms-auto hidden items-center gap-1 rounded-full bg-surface p-1 shadow-float ring-1 ring-brand-100 md:flex">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${on(href) ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-brand-700'}`}>
              <Icon size={16} />{label}{badge(href) > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs text-ink-900">{badge(href)}</span>}
            </Link>
          ))}
        </nav>
        <Link href="/updates" aria-label="What's new" title="What's new"
          className="relative ms-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-brand-600 shadow-float ring-1 ring-brand-100 md:ms-0">
          <Bell size={20} />
          {(home?.unread ?? 0) > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-amber-400 px-1 text-[11px] font-bold text-ink-900">{home!.unread}</span>}
        </Link>
      </header>

      {error && <p className="mb-3 flex items-center gap-2 rounded-2xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200"><WifiOff size={16} />{error}</p>}
      <main className="pb-6">{children}</main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-brand-100 bg-surface/95 backdrop-blur md:hidden">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-semibold ${on(href) ? 'text-brand-700' : 'text-ink-400'}`}>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition ${on(href) ? 'bg-brand-100' : ''}`}><Icon size={20} /></span>
            {label}
            {badge(href) > 0 && <span className="absolute right-[26%] top-1 rounded-full bg-amber-400 px-1.5 text-[10px] font-bold text-ink-900">{badge(href)}</span>}
          </Link>
        ))}
      </nav>
    </div>
  );
}
