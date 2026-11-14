import type { Metadata, Viewport } from 'next';
import {
  Source_Sans_3, Source_Serif_4, Noto_Sans_Devanagari, Noto_Sans_Bengali, Noto_Sans_Telugu, Noto_Sans_Tamil, Noto_Sans_Gujarati,
  Noto_Sans_Kannada, Noto_Sans_Oriya, Noto_Sans_Malayalam, Noto_Naskh_Arabic,
} from 'next/font/google';
import { LangProvider } from '@/lib/i18n';
import BottomNav from '@/components/shell/BottomNav';
import ThemeInit from '@/components/shell/ThemeInit';
import ServerWake from '@/components/shell/ServerWake';
import AuthGate from '@/components/shell/AuthGate';
import TutorialOverlay from '@/components/tutorial/TutorialOverlay';
import './globals.css';

const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const serif = Source_Serif_4({ subsets: ['latin'], variable: '--font-serif', display: 'swap' });
// One professional Noto face per script. The browser downloads a script's font only when that language is on screen.
const deva = Noto_Sans_Devanagari({ subsets: ['devanagari'], variable: '--font-deva', display: 'swap', preload: false });
const beng = Noto_Sans_Bengali({ subsets: ['bengali'], variable: '--font-beng', display: 'swap', preload: false });
const telu = Noto_Sans_Telugu({ subsets: ['telugu'], variable: '--font-telu', display: 'swap', preload: false });
const tami = Noto_Sans_Tamil({ subsets: ['tamil'], variable: '--font-tami', display: 'swap', preload: false });
const guju = Noto_Sans_Gujarati({ subsets: ['gujarati'], variable: '--font-guju', display: 'swap', preload: false });
const knda = Noto_Sans_Kannada({ subsets: ['kannada'], variable: '--font-knda', display: 'swap', preload: false });
const orya = Noto_Sans_Oriya({ subsets: ['oriya'], variable: '--font-orya', display: 'swap', preload: false });
const mlym = Noto_Sans_Malayalam({ subsets: ['malayalam'], variable: '--font-mlym', display: 'swap', preload: false });
const arab = Noto_Naskh_Arabic({ subsets: ['arabic'], variable: '--font-arab', display: 'swap', preload: false });

// The manifest and icons let a phone or tablet install the site to the home screen and open it full screen like an app.
export const metadata: Metadata = {
  title: 'CRP Mentor Copilot', description: 'Prioritise schools and teachers for mentoring visits', manifest: '/manifest.webmanifest',
  icons: { icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: '/icons/apple-touch-icon.png' },
  appleWebApp: { capable: true, title: 'CRP Copilot', statusBarStyle: 'default' },
};
// Phone and app friendly: fills the whole screen (notch / home bar handled in globals.css), no zoom jumps on inputs.
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#235347' };

const fonts = [sans, serif, deva, beng, telu, tami, guju, knda, orya, mlym, arab].map((f) => f.variable).join(' ');

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={fonts}>
      <body className="min-h-screen min-h-dvh font-sans antialiased"><LangProvider><ThemeInit /><ServerWake /><AuthGate>{children}<BottomNav /><TutorialOverlay /></AuthGate></LangProvider></body>
    </html>
  );
}
