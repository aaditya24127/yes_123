'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { useHome, fmtAgo } from '@/lib/hooks';
import Shell from '@/components/Shell';
import { Button, Card, Empty, Title } from '@/components/ui';

export default function Messages() {
  const { data, error, reload } = useHome();
  const [body, setBody] = useState('');
  const [concern, setConcern] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const count = data?.messages.length ?? 0;
  const unread = data?.messages.some((m) => m.sender !== 'teacher' && !m.read_at) ?? false;

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [count]);
  useEffect(() => { if (unread) api.readAll().then(reload).catch(() => undefined); }, [unread, reload]);

  const send = async () => {
    setBusy(true); setErr('');
    try { await api.message(body, concern); setBody(''); await reload(); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not send.'); }
    setBusy(false);
  };

  return (
    <Shell home={data} error={error}>
      <Title sub="Talk to your CRP. Use a concern when something needs their attention.">Messages and concerns</Title>
      <div className="space-y-3">
        {data && data.messages.length === 0 && <Empty icon={<MessageCircle size={34} />} title="No messages yet" hint="Write to your CRP below, for example a problem in class or something you need." />}
        {data?.messages.map((m) => {
          const mine = m.sender === 'teacher';
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-float ${mine ? 'rounded-br-lg bg-brand-600 text-white' : 'rounded-bl-lg bg-surface text-ink-900 ring-1 ring-brand-100'}`}>
                {m.is_concern && <p className={`mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide ${mine ? 'text-amber-300' : 'text-amber-700'}`}><TriangleAlert size={12} />Concern</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className={`mt-1 text-xs ${mine ? 'text-brand-200' : 'text-ink-400'}`}>{mine ? 'You' : 'Your CRP'} · {fmtAgo(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <Card className="sticky bottom-20 mt-5 md:bottom-4">
        <div className="mb-3 inline-flex rounded-full bg-page p-1 ring-1 ring-brand-100">
          {[{ v: true, l: 'Concern' }, { v: false, l: 'Message' }].map((o) => (
            <button key={o.l} type="button" onClick={() => setConcern(o.v)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${concern === o.v ? 'bg-brand-600 text-white' : 'text-ink-500'}`}>{o.l}</button>))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder={concern ? 'Tell your CRP what is worrying you…' : 'Write a message…'}
          className="w-full rounded-2xl border-0 bg-page px-4 py-3 text-ink-900 ring-1 ring-brand-200 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-600" />
        {err && <p role="alert" className="mt-2 text-sm text-red-700">{err}</p>}
        <Button className="mt-3 w-full" busy={busy} disabled={!body.trim()} onClick={send}><Send size={16} />{concern ? 'Send concern' : 'Send message'}</Button>
      </Card>
    </Shell>
  );
}
