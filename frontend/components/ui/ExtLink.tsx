'use client';
// A link that opens outside the current view (new tab on the website, the phone's browser in the app).
import type { ReactNode } from 'react';
import { openExternal } from '@/lib/platform';
import { useLang } from '@/lib/i18n';

export default function ExtLink({ href, children, className = '', title }: { href: string; children: ReactNode; className?: string; title?: string }) {
  const { tr } = useLang();
  return (
    <a href={href} title={tr(title)} className={className} rel="noreferrer"
      onClick={(e) => { if (!href || href === '#') return; e.preventDefault(); openExternal(href); }}>
      {children}
    </a>
  );
}
