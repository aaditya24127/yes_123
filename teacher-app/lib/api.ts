// Every call to the backend, in one place. The sign-in token is kept on this device only.
export interface Profile { id: string; name: string; email: string; school: string; classes: number[] | null; subjects: string[] | null }
export interface Task {
  id: string; kind: string; title: string; message: string | null; due_date: string | null; visit_date: string | null;
  status: 'open' | 'submitted' | 'accepted' | 'cancelled'; response_text: string | null; created_at: string; responded_at: string | null;
}
export interface Msg { id: string; sender: 'crp' | 'teacher' | 'system'; body: string; request_id: string | null; is_concern: boolean; created_at: string; read_at: string | null }
export interface Notice { id: string; title: string; body: string | null; created_at: string; read_at: string | null }
export interface Home {
  teacher: Profile; upcoming_visit: { visit_date: string; message: string | null } | null; tasks: Task[]; messages: Msg[]; notifications: Notice[];
  unread: number; kinds: Record<string, string>;
}
export interface Visits { visits: { visit_date: string; visit_type: string }[]; follow_ups: { due_date: string; status: string; action: string | null }[] }

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
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    const txt = await res.text();
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
  submit: (taskId: string | null, text: string, files: File[]) => {
    const f = new FormData();
    if (taskId) f.append('task_id', taskId);
    if (text.trim()) f.append('text', text.trim());
    files.forEach((x) => f.append('files', x, x.name));
    return call<{ ok: boolean; files: number }>('/api/teacher/submit', { method: 'POST', body: f });
  },
};
