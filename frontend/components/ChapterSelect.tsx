'use client';
// Chapter dropdown for the visit and the assessment: the chapters of the school's board and medium, for the chosen class and subject (backend: /api/curriculum).
// The chosen chapter is plain text (it is stored as the visit's topic). "Other" lets the person type one that is not in the list.
import { useEffect, useMemo, useState } from 'react';
import { Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api';
import type { Curriculum } from '@/lib/types';

const OTHER = '__other__';

export default function ChapterSelect({ schoolId, classNo, subject, value, onChange, label = 'Chapter being taught today' }: {
  schoolId?: string; classNo?: number | null; subject?: string; value: string; onChange: (chapter: string) => void; label?: string;
}) {
  const [cur, setCur] = useState<Curriculum | null>(null);
  const [typing, setTyping] = useState(false);
  const ready = !!schoolId && !!classNo && !!subject;

  useEffect(() => {
    let off = false;
    setCur(null);
    if (!ready) return;
    api.curriculum({ school_id: schoolId, class_no: classNo, subject }).then((c) => { if (!off) setCur(c); }).catch(() => { if (!off) setCur({ books: [], note: null, board: null, own_board: null, board_label: null, count: 0 }); });
    return () => { off = true; };
  }, [ready, schoolId, classNo, subject]);

  const all = useMemo(() => new Set((cur?.books ?? []).flatMap((b) => b.chapters)), [cur]);
  const books = cur?.books ?? [];
  // A typed chapter that is not in the list keeps the box open (for example after the class or subject was changed).
  const other = typing || (!!value && !!cur && !all.has(value));
  const loading = ready && !cur;
  const note = cur?.note;
  const hint = !ready ? 'Choose the class and subject first, or type the chapter.'
    : loading ? 'Finding the chapters…'
    : books.length ? `${cur?.board_label ?? ''}${books.length > 1 ? `, ${books.length} books` : ''}. Pick “Other” to type a chapter that is not here.` : undefined;

  return (
    <Field label={label} hint={hint}>
      {!ready || (cur && !books.length) ? (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the chapter, for example: Place value" />
      ) : (
        <>
          <Select value={other ? OTHER : value} disabled={loading} onChange={(e) => {
            if (e.target.value === OTHER) { setTyping(true); onChange(''); } else { setTyping(false); onChange(e.target.value); }
          }}>
            <option value="">{loading ? 'Loading…' : 'Choose a chapter…'}</option>
            {books.map((b) => (
              <optgroup key={`${b.board}|${b.book}|${b.medium}`} label={`${b.book}${b.edition === 'older' ? ' (older edition)' : ''}${b.medium !== 'any' ? ` · ${b.medium}` : ''}`}>
                {b.chapters.map((c, i) => <option key={`${i}-${c}`} value={c}>{`${i + 1}. ${c}`}</option>)}
              </optgroup>
            ))}
            <option value={OTHER}>Other (type it)</option>
          </Select>
          {other && <Input className="mt-2" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the chapter" autoFocus />}
        </>
      )}
      {note && <span className="mt-1 block text-xs text-amber-700">{note}</span>}
    </Field>
  );
}
