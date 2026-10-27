'use client';
// The main menu, built from NAV in lib/app.config.ts.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FEATURES, NAV } from '@/lib/app.config';
import { useLang } from '@/lib/i18n';

export default function NavLinks({ compact }: { compact?: boolean }) {
  const { t } = useLang();
  const path = usePathname();
  const items = NAV.filter((n) => !n.feature || FEATURES[n.feature]);
  return (
    <nav className="hidden items-center gap-1 rounded-full md:flex bg-surface p-1 shadow-float ring-1 ring-brand-100">
      {items.map(({ href, label, icon: Icon }) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} title={t(label)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold transition ${on ? 'bg-brand-600 text-white' : 'text-ink-500 hover:text-brand-700'}`}>
            <Icon size={16} /><span className={compact ? 'hidden lg:inline' : 'hidden sm:inline'}>{t(label)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
