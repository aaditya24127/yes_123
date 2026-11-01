'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { ArrowLeftRight, ArrowUpDown, Check, Languages, LayoutGrid, Search, School, UserRound, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { Band, Config, Entity, Item, Ranking } from '@/lib/types';
import { BAND } from '@/lib/theme';
import { LANDING_URL } from '@/lib/platform';
import ItemCard from '@/components/ItemCard';
import PriorityPanel, { PriorityBody } from '@/components/PriorityPanel';
import DetailModal, { DetailBody } from '@/components/DetailModal';
import Carousel from '@/components/Carousel';
import { LANGS, useLang, type Key } from '@/lib/i18n';
import NavLinks from '@/components/shell/NavLinks';

type Filter = 'all' | Band | 'insufficient';
type UI = 'grid' | 'vertical' | 'horizontal';
const UIS: { key: UI; label: Key; Icon: typeof LayoutGrid }[] = [
  { key: 'grid', label: 'grid', Icon: LayoutGrid }, { key: 'vertical', label: 'vertical', Icon: ArrowUpDown }, { key: 'horizontal', label: 'sideways', Icon: ArrowLeftRight },
];

export default function Home() {
  const { t, lang, setLang, dir, date } = useLang();
  const [langMenu, setLangMenu] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [saved, setSaved] = useState<Record<string, number>>({});
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [entity, setEntity] = useState<Entity>('school');
  const [ranking, setRanking] = useState<Ranking | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState<Item | null>(null);
  const [applying, setApplying] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const seq = useRef(0);
  const [ui, setUi] = useState<UI>('grid');
  const [uiMenu, setUiMenu] = useState(false);
  const [side, setSide] = useState<null | 'detail' | 'priority'>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [vw, setVw] = useState(1280);
  const [hdr, setHdr] = useState(170);
  const headerRef = useRef<HTMLElement>(null);
  const focus = ui !== 'grid' && vw >= 768;      // the one-by-one and sideways layouts need a wide screen; phones always get the card list
  useEffect(() => { try { const u = localStorage.getItem('crp-ui'); if (u === 'vertical' || u === 'horizontal') setUi(u); } catch { /* ignore */ } }, []);
  const pickUi = (u: UI) => {
    setUi(u); setUiMenu(false); setSide(null); setPanel(false); setSelected(null); setFocusIdx(0);
    try { localStorage.setItem('crp-ui', u); } catch { /* ignore */ }
  };
  useEffect(() => {
    const on = () => { setVw(window.innerWidth); if (headerRef.current) setHdr(headerRef.current.offsetHeight); };
    on(); window.addEventListener('resize', on);
    const ro = headerRef.current ? new ResizeObserver(on) : null; if (headerRef.current) ro?.observe(headerRef.current);
    return () => { window.removeEventListener('resize', on); ro?.disconnect(); };
  }, []);
  useEffect(() => { document.body.style.overflow = focus ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [focus]);

  useEffect(() => {
    api.config().then((c) => { setConfig(c); setSaved(c.weights); setWeights(c.weights); }).catch((e) => setError(String(e.message || e)));
  }, []);

  const dirty = useMemo(() => [...new Set([...Object.keys(weights), ...Object.keys(saved)])].some((c) => (weights[c] ?? 0) !== (saved[c] ?? 0)), [weights, saved]);
  // The list is asked for at the same time as the settings (not after them). With unchanged weights the server uses the saved ones,
  // so nothing is asked twice when the settings arrive; a new request goes out only when the person moves a slider, switches
  // schools / teachers, or the factors change (reload).
  const [reload, setReload] = useState(0);
  const lastAsk = useRef('');
  const askTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const key = `${entity}|${dirty ? JSON.stringify(weights) : ''}|${reload}`;
    if (key === lastAsk.current) return;
    lastAsk.current = key;
    clearTimeout(askTimer.current);
    const id = ++seq.current;
    askTimer.current = setTimeout(() => {
      api.ranking(entity, dirty ? weights : undefined).then((r) => { if (id === seq.current) { setRanking(r); setError(''); } }).catch((e) => { if (id === seq.current) { lastAsk.current = ''; setError(String(e.message || e)); } });
    }, dirty ? 120 : 0);
  }, [entity, weights, dirty, reload]);
  useEffect(() => () => clearTimeout(askTimer.current), []);
  const reloadConfig = useCallback(() => api.config().then((c) => { setReload((n) => n + 1); setConfig(c); setSaved(c.weights); setWeights((w) => ({ ...c.weights, ...Object.fromEntries(Object.entries(w).filter(([k, v]) => v > 0 && !(k in c.weights))) })); }), []);

  const apply = useCallback(async () => {
    setApplying(true);
    try {
      const r = await api.apply(weights);
      const c = await api.config();
      setReload((n) => n + 1); setConfig(c); setSaved(c.weights); setWeights(c.weights);
      setToast(t('saved', { v: r.version })); setTimeout(() => setToast(''), 2600);
    } catch (e) { setError(String((e as Error).message)); } finally { setApplying(false); }
  }, [weights, t]);

  const q = query.trim().toLowerCase();
  const match = (i: Item) => !q || [i.name, i.subtitle, i.location, i.school_name, i.school_code, i.grades].join(' ').toLowerCase().includes(q);
  const items = (ranking?.items ?? []).filter(match);
  const ranked = items.filter((i) => !i.insufficient && (filter === 'all' || filter === i.band));
  const unranked = items.filter((i) => i.insufficient && (filter === 'all' || filter === 'insufficient'));
  const s = ranking?.summary;
  const list = [...ranked, ...unranked];
  const fi = Math.min(focusIdx, Math.max(0, list.length - 1));
  const focusedId = list[fi]?.id ?? null;
  useEffect(() => { const t = setTimeout(() => setDetailId(focusedId), 160); return () => clearTimeout(t); }, [focusedId]);
  const detailItem = list.find((i) => i.id === detailId) ?? list[fi] ?? null;
  // Side pane widths. Detail is the focus, so it gets most of the screen.
  // To revert the "bigger details" try-out, set DETAIL_WIDE = false (previous detail width: 46% of the screen, max 640px).
  const DETAIL_WIDE = true;
  const prioW = Math.max(360, Math.min(640, Math.round(vw * 0.46)));
  const detailW = DETAIL_WIDE ? Math.max(480, Math.min(1120, Math.round(vw * 0.66))) : prioW;
  const sideW = side === 'detail' ? detailW : prioW;

  const chips: { key: Filter; label: string; n: number | undefined }[] = [
    { key: 'all', label: t('all'), n: s ? s.total : undefined },
    { key: 'critical', label: t('band_critical'), n: s?.critical }, { key: 'high', label: t('band_high'), n: s?.high },
    { key: 'medium', label: t('band_medium'), n: s?.medium }, { key: 'low', label: t('band_low'), n: s?.low },
    { key: 'insufficient', label: t('needsEvidence'), n: s?.insufficient },
  ];

  return (
    <main className={`mx-auto max-w-[1400px] px-4 sm:px-8 ${focus ? 'pb-4' : 'pb-16'}`}>
      <header ref={headerRef} className={`${focus ? 'sticky' : 'relative sm:sticky'} top-0 z-30 -mx-4 bg-gradient-to-b from-page via-page/95 to-transparent px-4 pb-4 pt-5 sm:-mx-8 sm:px-8`}>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <a href={LANDING_URL} className="flex items-center gap-2.5" aria-label="CRP Mentor Copilot home page" title="Back to the landing page">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-lg font-bold text-white shadow-float">C</div>
            <span className="hidden font-serif text-xl font-semibold tracking-tight text-ink-900 xl:block">CRP Mentor Copilot</span>
          </a>
          <NavLinks compact />
          <div className="relative hidden shrink-0 md:block">
            <button onClick={() => { setUiMenu((v) => !v); setLangMenu(false); }} aria-label={t('iface')} title={t('iface')}
              className={`flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold shadow-float ring-1 ring-brand-100 transition ${uiMenu ? 'bg-brand-600 text-white' : 'bg-surface text-brand-600 hover:text-brand-800'}`}>U</button>
            <AnimatePresence>
              {uiMenu && (
                <motion.div initial={{ opacity: 0, scale: 0.9, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -6 }}
                  className="absolute start-0 top-14 z-40 flex gap-4 rounded-3xl bg-surface p-4 shadow-panel ring-1 ring-brand-100">
                  {UIS.map(({ key, label, Icon }, i) => (
                    <motion.button key={key} onClick={() => pickUi(key)} aria-label={t(label)}
                      initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 22 }} whileHover={{ scale: 1.08 }}
                      className="flex flex-col items-center gap-1.5">
                      <span className={`flex h-12 w-12 items-center justify-center rounded-full shadow-float ${ui === key ? 'bg-brand-600 text-white ring-2 ring-brand-600 ring-offset-2 ring-offset-white' : 'bg-brand-50 text-brand-700 ring-1 ring-brand-100'}`}><Icon size={20} /></span>
                      <span className="text-[11px] font-semibold text-ink-500">{t(label)}</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative shrink-0">
            <button onClick={() => { setLangMenu((v) => !v); setUiMenu(false); }} aria-label={t('language')} title={t('language')}
              className={`flex h-12 w-12 items-center justify-center rounded-full shadow-float ring-1 ring-brand-100 transition ${langMenu ? 'bg-brand-600 text-white' : 'bg-surface text-brand-600 hover:text-brand-800'}`}><Languages size={21} /></button>
            <AnimatePresence>
              {langMenu && (
                <motion.div initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.92, y: -6 }}
                  className="absolute start-0 top-14 z-40 w-[min(340px,calc(100vw-2rem))] rounded-3xl bg-surface p-3 shadow-panel ring-1 ring-brand-100">
                  <p className="px-2 pb-2 pt-1 text-xs font-semibold text-ink-400">{t('language')}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {LANGS.map((l, i) => (
                      <motion.button key={l.code} onClick={() => { setLang(l.code); setLangMenu(false); }} lang={l.code} dir={l.rtl ? 'rtl' : 'ltr'}
                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.025 }}
                        className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 text-start transition ${lang === l.code ? 'bg-brand-600 text-white shadow-float' : 'bg-brand-50/60 text-ink-900 hover:bg-brand-100'}`}>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold">{l.native}</span>
                          <span className={`block text-[11px] ${lang === l.code ? 'text-white/80' : 'text-ink-500'}`} dir="ltr" lang="en">{l.english}</span>
                        </span>
                        {lang === l.code && <Check size={16} className="shrink-0" />}
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="relative order-last flex h-12 min-w-0 flex-[1_1_100%] items-center sm:order-none sm:ms-auto sm:h-14 sm:flex-1 sm:max-w-3xl sm:items-center rounded-full bg-surface ps-5 pe-2 shadow-float ring-1 ring-brand-100 transition focus-within:ring-2 focus-within:ring-brand-500">
            <Search size={20} className="shrink-0 text-brand-500" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={entity === 'school' ? t('searchSchools') : t('searchTeachers')}
              className="h-full min-w-0 flex-1 bg-transparent px-3 text-[15px] text-ink-900 outline-none placeholder:text-ink-400" />
            {query && <button onClick={() => setQuery('')} aria-label={t('clear')} className="me-1 rounded-full p-1.5 text-ink-400 hover:bg-brand-50 hover:text-brand-700"><X size={16} /></button>}
            <button onClick={() => { if (focus) setSide((v) => (v === 'priority' ? null : 'priority')); else { setSelected(null); setPanel((p) => !p); } }} aria-label={t('priorities')} title={t('priorities')}
              className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-bold shadow-float transition ${(focus ? side === 'priority' : panel) ? 'bg-brand-800 text-white' : 'bg-brand-600 text-white hover:bg-brand-700'}`}>
              P
              {dirty && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-amber-400" />}
            </button>
          </div>
        </div>

        <div className="no-bar -mx-4 mt-3 flex items-center gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:mt-4 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
          <div className="relative flex shrink-0 rounded-full bg-surface p-1 shadow-float ring-1 ring-brand-100">
            {(['school', 'teacher'] as Entity[]).map((e) => (
              <button key={e} onClick={() => { setEntity(e); setFilter('all'); setFocusIdx(0); }} className={`relative z-10 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${entity === e ? 'text-white' : 'text-ink-500 hover:text-brand-700'}`}>
                {entity === e && <motion.span layoutId="seg" className="absolute inset-0 -z-10 rounded-full bg-brand-600" transition={{ type: 'spring', stiffness: 400, damping: 32 }} />}
                {e === 'school' ? <School size={16} /> : <UserRound size={16} />}{e === 'school' ? t('schools') : t('teachers')}
              </button>
            ))}
          </div>
          <div className="flex gap-2 sm:flex-wrap">
            {chips.map((c) => (
              <button key={c.key} onClick={() => { setFilter(c.key); setFocusIdx(0); }}
                className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition ${filter === c.key ? 'bg-brand-600 text-white ring-brand-600 shadow-float' : 'bg-surface text-ink-700 ring-brand-100 hover:ring-brand-300'}`}>
                {c.key !== 'all' && c.key !== 'insufficient' && <span className={`h-2 w-2 rounded-full ${BAND[c.key as Band].bar}`} />}
                {c.label}<span className={`tabular-nums ${filter === c.key ? 'text-white/80' : 'text-ink-400'}`}>{c.n ?? '–'}</span>
              </button>
            ))}
          </div>
          {ranking && <span className="ms-auto hidden rounded-full bg-surface px-3.5 py-2 text-xs sm:inline font-medium text-ink-500 shadow-float ring-1 ring-brand-100">{date(ranking.as_of)}</span>}
        </div>
      </header>

      {error && <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!ranking && !error && !focus && (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-60 animate-pulse rounded-3xl bg-surface/70 shadow-float" />)}</div>
      )}

      {focus && ranking && list.length > 0 && (
        <div dir="ltr" className="mt-2 flex gap-5" style={{ height: `calc(100vh - ${hdr}px - 20px)` }}>
          <div className="relative min-w-0 flex-1">
            <Carousel key={ui} items={list} axis={ui === 'vertical' ? 'y' : 'x'} index={fi} onIndex={setFocusIdx} onActivate={() => setSide('detail')} />
          </div>
          <AnimatePresence initial={false}>
            {side && (
              <motion.aside key="side" initial={{ width: 0, opacity: 0 }} animate={{ width: sideW, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 220, damping: 30 }} className="h-full shrink-0 overflow-hidden rounded-[28px] bg-surface shadow-panel">
                <div style={{ width: sideW }} dir={dir} className="h-full">
                  {side === 'detail' && detailItem && (
                    <motion.div key={detailItem.id} initial={{ opacity: 0.35, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="h-full">
                      <DetailBody compact={sideW < 860} item={detailItem} onClose={() => setSide(null)} />
                    </motion.div>
                  )}
                  {side === 'priority' && config && (
                    <div className="h-full p-6">
                      <PriorityBody onClose={() => setSide(null)} categories={config.categories} weights={weights} dirty={dirty} applying={applying}
                        onChange={(code, v) => setWeights((w) => ({ ...w, [code]: v }))} onReset={() => setWeights(saved)} onApply={apply}
          library={config.library} onFactorsChanged={reloadConfig} />
                    </div>
                  )}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      )}

      {!focus && (
        <>
      <LayoutGroup>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {ranked.map((i) => <ItemCard key={`${i.entity}-${i.id}`} item={i} onOpen={(x) => { setPanel(false); setSelected(x); }} />)}
        </div>
        {unranked.length > 0 && (
          <>
            <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wider text-ink-400">{t('needsMore')}</h2>
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {unranked.map((i) => <ItemCard key={`${i.entity}-${i.id}`} item={i} onOpen={(x) => { setPanel(false); setSelected(x); }} />)}
            </div>
          </>
        )}
      </LayoutGroup>

        </>
      )}

      {ranking && list.length === 0 && (
        <div className="mt-16 text-center text-ink-500">{query.trim() ? t('noMatch', { q: query }) : t('noneInGroup')}</div>
      )}

      {config && !focus && (
        <PriorityPanel open={panel} onClose={() => setPanel(false)} categories={config.categories} weights={weights} dirty={dirty} applying={applying}
          onChange={(code, v) => setWeights((w) => ({ ...w, [code]: v }))} onReset={() => setWeights(saved)} onApply={apply}
          library={config.library} onFactorsChanged={reloadConfig} />
      )}
      {!focus && <DetailModal item={selected} onClose={() => setSelected(null)} />}

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-brand-800 px-5 py-3 text-sm font-semibold text-white shadow-panel">{toast}</motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
