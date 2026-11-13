'use client';
// Phone-style bottom menu (small screens and the Android / iOS app). Built from the same NAV list as the top menu.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FEATURES, NAV } from '@/lib/app.config';
import { useLang } from '@/lib/i18n';
import { isLoginPath } from './AuthGate';

export default function BottomNav() {
  const { t } = useLang();
  const path = usePathname();
  const items = NAV.filter((n) => !n.feature || FEATURES[n.feature]);
  if (isLoginPath(path)) return null;      // nothing to go to before signing in
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-[55] flex border-t border-brand-100 bg-surface/95 backdrop-blur md:hidden">
      {items.map(({ href, label, icon: Icon }) => {
        const on = href === '/' ? path === '/' : path.startsWith(href);
        return (
          <Link key={href} href={href} data-tour={`nav-${href === '/' ? 'home' : href.slice(1)}`} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold ${on ? 'text-brand-700' : 'text-ink-400'}`}>
            <Icon size={20} />{t(label)}
          </Link>
        );
      })}
    </nav>
  );
}
