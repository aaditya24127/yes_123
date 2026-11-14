'use client';
// The "What did you see?" box on the visit page: type, speak (any language, also mixed), photo of handwriting, or tap quick notes.
// Whatever is added lands in the same box and can be edited. One button turns it into English and back. Recordings and photos are not saved.
import { useRef, useState } from 'react';
import { Camera, Languages, ListChecks } from 'lucide-react';
import AudioRecorder from '@/components/ui/AudioRecorder';
import { Button, Field, Spinner, TextArea } from '@/components/ui';
import { api } from '@/lib/api';
import { useLang } from '@/lib/i18n';

const CHIPS: { title: string; items: string[] }[] = [
  { title: 'Going well', items: ['Clear instructions', 'Children took part', 'Teaching aids used', 'Teacher checked understanding', 'Good use of the board', 'Children worked in groups'] },
  { title: 'Needs attention', items: ['Projector or equipment not working', 'Few children answered', 'Group work uneven', 'Class too noisy', 'Pace too fast', 'Charts or displays too high for children'] },
];

type Busy = null | 'voice' | 'photo' | 'translate';

export default function NotesBox({ value, onSave, setError }: { value: string; onSave: (text: string) => void; setError: (e: string) => void }) {
  const { tr } = useLang();
  const [text, setText] = useState(value);
  const [stash, setStash] = useState<string | null>(null);        // the other version (original <-> English) while one of them is shown
  const [english, setEnglish] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState('');
  const [chips, setChips] = useState(false);
  const ref = useRef(value);
  const change = (t: string) => { ref.current = t; setText(t); };
  const commit = (t: string) => onSave(t);
  const add = (t: string) => {                                       // adds below what is already written
    const n = ref.current.trim() ? `${ref.current.replace(/\s+$/, '')}\n${t}` : t;
    change(n); setStash(null); setEnglish(false); commit(n);
  };
  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    setBusy(kind); setNote(''); setError('');
    try { await fn(); } catch (e) { setError((e as Error).message); } finally { setBusy(null); }
  };
  const onVoice = (blob: Blob, name: string) => run('voice', async () => { const r = await api.visits.notesVoice(blob, name); add(r.text); setNote(tr('Added from your voice. Please read it and fix any word.')); });
  const onPhoto = (f: File) => run('photo', async () => { const r = await api.visits.notesPhoto(f); add(r.text); setNote(tr('Added from your photo. Please read it and fix any word.')); });
  const translate = () => run('translate', async () => {
    const r = await api.visits.notesTranslate(ref.current);
    if (r.already_english) { setNote(tr('This is already in English.')); return; }
    setStash(ref.current); setEnglish(true); change(r.english); commit(r.english);
  });
  const swap = () => { if (stash === null) return; const other = stash; setStash(ref.current); setEnglish(!english); change(other); commit(other); };

  return (
    <div>
      <Field label={tr('What did you see?')}>
        <TextArea value={text} onChange={(e) => change(e.target.value)} onBlur={() => commit(ref.current)} rows={6}
          placeholder={tr('Type here, or speak, or add a photo. Who answered, how the teacher checked understanding, use of materials…')} />
      </Field>

      <div className="mt-2 flex flex-wrap items-center gap-2" data-tour="v-notes-tools">
        <AudioRecorder small checkSound label={tr('Speak your notes')} busy={busy === 'voice'} onDone={onVoice} />
        <label className={`inline-flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Camera size={15} />{tr('Photo of notes')}{' '}<input type="file" accept="image/*" className="hidden" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPhoto(f); e.target.value = ''; }} />
        </label>
        <Button variant="soft" className="px-3 py-1.5" icon={<ListChecks size={15} />} onClick={() => setChips((v) => !v)} aria-expanded={chips}>{tr('Quick notes')}</Button>
        {stash !== null
          ? <Button variant="soft" className="px-3 py-1.5" icon={<Languages size={15} />} onClick={swap}>{english ? tr('Show original') : tr('Show English')}</Button>
          : <Button variant="soft" className="px-3 py-1.5" icon={<Languages size={15} />} busy={busy === 'translate'} disabled={!!busy || !text.trim()} onClick={translate}>{tr('Translate to English')}</Button>}
      </div>

      {chips && (
        <div className="mt-3 space-y-2 rounded-2xl bg-brand-50/60 p-3">
          {CHIPS.map((g) => (
            <div key={g.title}>
              <p className="mb-1 text-xs font-semibold text-ink-500">{tr(g.title)}</p>
              <div className="flex flex-wrap gap-1.5">{g.items.map((c) => (
                <button key={c} type="button" onClick={() => add(`- ${c}`)} className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-100 transition hover:bg-brand-100">{tr(c)}</button>))}</div>
            </div>))}
        </div>
      )}

      <div className="mt-2 min-h-[1.25rem] text-xs text-ink-500" aria-live="polite">
        {busy === 'voice' ? <Spinner label={tr('Turning your voice into text. A long recording can take a minute…')} />
          : busy === 'photo' ? <Spinner label={tr('Reading your photo…')} />
          : busy === 'translate' ? <Spinner label={tr('Translating…')} />
          : stash !== null ? (english ? tr('Showing English. The version you see here is the one that is saved.') : tr('Showing the original. The version you see here is the one that is saved.'))
          : note || tr('Recordings and photos are not saved. Only the text stays.')}
      </div>
    </div>
  );
}
