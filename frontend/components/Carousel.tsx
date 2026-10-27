'use client';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react';
import type { Item } from '@/lib/types';
import ItemCard from './ItemCard';
import { useLang } from '@/lib/i18n';

const GAP = 28;

interface Props {
  items: Item[]; axis: 'y' | 'x'; index: number;
  onIndex: (i: number) => void; onActivate: (item: Item) => void;
}

// One card at a time. The focused card is sharp and centred; its neighbours are scaled down, faded and blurred.
// The mouse wheel moves a single card per gesture; touch, drag and the arrow keys work too.
export default function Carousel({ items, axis, index, onIndex, onActivate }: Props) {
  const { t } = useLang();
  const vertical = axis === 'y';
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [pos, setPos] = useState(index);
  const idx = useRef(index);
  const raf = useRef(0);
  const count = useRef(items.length);
  count.current = items.length;

  const cardH = Math.max(320, Math.min(400, size.h - 40));
  const cardW = vertical ? Math.max(220, Math.min(560, size.w - 40)) : Math.max(300, Math.min(390, size.w - 80));
  const itemMain = vertical ? cardH : cardW;
  const step = itemMain + GAP;
  const viewMain = vertical ? size.h : size.w;
  const pad = Math.max(0, (viewMain - itemMain) / 2);
  const key = vertical ? 'top' : 'left';

  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Keep the focused card centred whenever the viewport (e.g. a side panel opening) or the list changes.
  useLayoutEffect(() => {
    const el = ref.current; if (!el || !size.h) return;
    const i = Math.min(idx.current, Math.max(0, items.length - 1));
    el.scrollTo({ [key]: i * step, behavior: 'auto' });
    setPos(i);
  }, [step, size.w, size.h, key, items.length]);

  const go = useCallback((i: number) => {
    const el = ref.current; if (!el) return;
    const t = Math.max(0, Math.min(count.current - 1, i));
    el.scrollTo({ [key]: t * step, behavior: 'smooth' });
  }, [key, step]);

  // External index change (e.g. filter reset).
  useEffect(() => { if (index !== idx.current) { idx.current = index; go(index); } }, [index, go]);

  const onScroll = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      const el = ref.current; if (!el) return;
      const p = (vertical ? el.scrollTop : el.scrollLeft) / step;
      setPos(p);
      const i = Math.max(0, Math.min(count.current - 1, Math.round(p)));
      if (i !== idx.current) { idx.current = i; onIndex(i); }
    });
  };

  // Wheel: exactly one card per gesture, ignoring trackpad inertia.
  useEffect(() => {
    const el = ref.current; if (!el) return;
    let lockUntil = 0, lastT = 0, lastAbs = 0;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) && !vertical ? e.deltaX : e.deltaY;
      const now = performance.now(), a = Math.abs(d);
      const decaying = now - lastT < 120 && a <= lastAbs;
      lastT = now; lastAbs = a;
      if (a < 4 || now < lockUntil || decaying) return;
      lockUntil = now + 480;
      go(idx.current + (d > 0 ? 1 : -1));
    };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [go, vertical]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return;
      const next = vertical ? 'ArrowDown' : 'ArrowRight', prev = vertical ? 'ArrowUp' : 'ArrowLeft';
      if (e.key === next || e.key === 'PageDown') { e.preventDefault(); go(idx.current + 1); }
      else if (e.key === prev || e.key === 'PageUp') { e.preventDefault(); go(idx.current - 1); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [go, vertical]);

  const focused = Math.round(pos);
  const Prev = vertical ? ChevronUp : ChevronLeft, Next = vertical ? ChevronDown : ChevronRight;
  const btn = 'flex h-9 w-9 items-center justify-center rounded-full bg-surface text-brand-700 shadow-float ring-1 ring-brand-100 transition hover:bg-brand-50 disabled:opacity-30';

  return (
    <div dir="ltr" className="relative h-full w-full">
      <div ref={ref} onScroll={onScroll} className={`no-bar h-full w-full snap-mandatory ${vertical ? 'snap-y overflow-y-auto overflow-x-hidden' : 'snap-x overflow-x-auto overflow-y-hidden'}`} style={{ overscrollBehavior: 'contain' }}>
        <div style={vertical
          ? { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: GAP, paddingTop: pad, paddingBottom: pad }
          : { display: 'flex', alignItems: 'center', gap: GAP, paddingLeft: pad, paddingRight: pad, height: '100%', width: 'max-content' }}>
          {items.map((it, i) => {
            const c = Math.min(Math.abs(pos - i), 2);
            return (
              <motion.div key={`${it.entity}-${it.id}`} layout="position" transition={{ type: 'spring', stiffness: 260, damping: 30 }} className="flex-none snap-center" style={{ width: cardW, height: cardH }}>
                <div className="h-full w-full will-change-transform" style={{ transform: `scale(${1 - c * 0.07})`, opacity: Math.max(0.22, 1 - c * 0.4), filter: c > 0.03 ? `blur(${(c * 3.4).toFixed(2)}px)` : 'none' }}>
                  <ItemCard plain item={it} onOpen={(x) => (i === focused ? onActivate(x) : go(i))} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className={`pointer-events-none absolute flex items-center gap-2 ${vertical ? 'right-1 top-1/2 -translate-y-1/2 flex-col' : 'bottom-1 left-1/2 -translate-x-1/2'}`}>
        <button aria-label={t('prev')} disabled={focused <= 0} onClick={() => go(focused - 1)} className={`pointer-events-auto ${btn}`}><Prev size={18} /></button>
        <span className="pointer-events-auto rounded-full bg-surface px-3 py-1 text-xs font-semibold tabular-nums text-ink-500 shadow-float ring-1 ring-brand-100">{items.length ? focused + 1 : 0} / {items.length}</span>
        <button aria-label={t('next')} disabled={focused >= items.length - 1} onClick={() => go(focused + 1)} className={`pointer-events-auto ${btn}`}><Next size={18} /></button>
      </div>
    </div>
  );
}
