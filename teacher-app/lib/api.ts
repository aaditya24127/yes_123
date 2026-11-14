// Every call to the backend, in one place. The sign-in token is kept on this device only.
export interface Profile { id: string; name: string; email: string; school: string; classes: number[] | null; subjects: string[] | null }
export interface TaskFile { id: string; name: string; size: number; format: string; status: string; created_at: string }
export interface TaskItem {
  id: string; position: number; title: string; instructions: string | null; kind: string; status: 'open' | 'submitted' | 'accepted' | 'rejected';
  response_text: string | null; review_remark: string | null; added_to: string | null; submitted_at: string | null; reviewed_at: string | null; files: TaskFile[];
}
export interface Task {
  id: string; kind: string; title: string; message: string | null; due_date: string | null; visit_date: string | null;
  status: 'open' | 'submitted' | 'accepted' | 'cancelled'; response_text: string | null; created_at: string; responded_at: string | null; items: TaskItem[];
}
export interface Msg { id: string; sender: 'crp' | 'teacher' | 'system'; body: string; request_id: string | null; is_concern: boolean; created_at: string; read_at: string | null }
export interface Notice { id: string; title: string; body: string | null; created_at: string; read_at: string | null }
export interface Home {
  teacher: Profile; upcoming_visit: { visit_date: string; message: string | null } | null; tasks: Task[]; messages: Msg[]; notifications: Notice[];
  unread: number; kinds: Record<string, string>;
}
export interface Visits {
  visits: { visit_date: string; visit_type: string }[]; follow_ups: { due_date: string; status: string; action: string | null }[];
  reports: { id: string; date: string; class_no: number | null; subject: string | null; topic: string | null; url: string }[];
}

// ---- the spoken assessment the CRP asks for
export interface AssessQuestion { n: number; question: string; answered: boolean; last: boolean }
export interface AssessReport {
  scores: { knowledge: number | null; teaching: number | null; overall: number | null; confidence: number | null };
  summary: string; strengths: string[]; changes: string[]; do: string[]; dont: string[]; visit_focus: string[];
  better_methods: { idea: string; why: string }[];
  questions: { n: number; kind: 'knowledge' | 'teaching'; question: string; score: number; said: string; comment: string; confidence: { score: number | null; band: string } }[];
  tools: { name: string; kind: string; fits: string; note: string }[];
  misconceptions: { misconception: string; fix_given: string; fix_is: string; note: string }[];
  checking_understanding: { rating: string; note: string }; weaker_students: { rating: string; note: string }; board_class_fit: { rating: string; note: string };
  speaking: { avg_wpm: number | null; pauses: number; longest_pause: number; fillers: number; hedges: number };
  data_quality: { answered: number; total: number; reliability: string; note: string };
}
export interface Assessment {
  id: string; status: 'preparing' | 'ready' | 'in_progress' | 'submitted' | 'reported' | 'failed'; subject: string; class_no: number | null; chapter: string; count: number;
  requested_by: string | null; requested_at: string; questions: AssessQuestion[]; report: AssessReport | null; error: string | null; pdf_url: string | null;
}

const KEY = 'crp-teacher-token';
export const token = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string) => { try { localStorage.setItem(KEY, t); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } },
};

export class AuthError extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const t = token.get();
  const headers = new Headers(init.headers);
  if (t) headers.set('Authorization', `Bearer ${t}`);
  // The free server sleeps when nobody has used it for a while; looking things up is tried again while it wakes up.
  const safe = !init.method || init.method === 'GET';
  let res: Response | null = null;
  // The host sometimes answers with a "checking your browser" web page when many people use it at once: wait and try again.
  const busyPage = (r: Response) => (r.headers.get('content-type') || '').includes('text/html') || r.status === 429;
  for (let i = 0; i < (safe ? 5 : 1); i++) {
    try { res = await fetch(path, { ...init, headers }); } catch { res = null; }
    if (res && ![502, 503, 504].includes(res.status) && !busyPage(res)) break;
    if (safe && i < 4) await new Promise((r) => setTimeout(r, 3500 * (i + 1)));
  }
  if (res && busyPage(res)) throw new Error('The system is busy right now. Please wait a minute and try again.');
  if (!res) throw new Error('Could not reach the server. Check your internet connection and try again.');
  if (!res.ok) {
    const txt = await res.text();
    if ([502, 503, 504].includes(res.status) || /ROUTER_EXTERNAL_TARGET_ERROR|FUNCTION_INVOCATION/.test(txt)) throw new Error('The server is waking up. Please wait a few seconds and try again.');
    let msg = txt || res.statusText;
    try { const d = JSON.parse(txt); msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail ?? d); } catch { /* plain text */ }
    if (res.status === 401 && t) throw new AuthError(msg);
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  login: (email: string, password: string) => call<{ token: string; teacher: Profile }>('/api/teacher/login', json({ email, password })),
  home: () => call<Home>('/api/teacher/home'),
  visits: () => call<Visits>('/api/teacher/visits'),
  readAll: () => call<{ ok: boolean }>('/api/teacher/notifications/read', { method: 'POST' }),
  message: (body: string, concern: boolean) => call<{ ok: boolean }>('/api/teacher/messages', json({ body, concern })),
  password: (old_password: string, new_password: string) => call<{ ok: boolean }>('/api/teacher/password', json({ old_password, new_password })),
  assessments: () => call<Assessment[]>('/api/teacher/assessments'),
  assessment: (id: string) => call<Assessment>(`/api/teacher/assessments/${id}`),
  assessmentStart: (id: string) => call<Assessment>(`/api/teacher/assessments/${id}/start`, { method: 'POST' }),
  /** One answer: a recording (read and then dropped by the server) or typed text. */
  assessmentAnswer: (id: string, n: number, a: { blob?: Blob; text?: string }) => {
    const f = new FormData();
    if (a.blob) f.append('file', a.blob, a.blob.type.includes('mp4') ? 'answer.m4a' : 'answer.webm');
    if (a.text?.trim()) f.append('text', a.text.trim());
    return call<{ ok: boolean; words: number; source: string }>(`/api/teacher/assessments/${id}/answers/${n}`, { method: 'POST', body: f });
  },
  assessmentFinish: (id: string) => call<Assessment>(`/api/teacher/assessments/${id}/finish`, { method: 'POST' }),
  /** Send one numbered task (itemId), or confirm a visit notice (taskId). */
  submit: (target: { itemId?: string; taskId?: string }, text: string, files: File[]) => {
    const f = new FormData();
    if (target.itemId) f.append('item_id', target.itemId);
    if (target.taskId) f.append('task_id', target.taskId);
    if (text.trim()) f.append('text', text.trim());
    files.forEach((x) => f.append('files', x, x.name));
    return call<{ ok: boolean; files: number }>('/api/teacher/submit', { method: 'POST', body: f });
  },
};
