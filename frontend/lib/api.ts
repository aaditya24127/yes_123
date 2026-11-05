// Every call to the backend, in one place. Pages never build URLs themselves, so an endpoint can change here only.
import type {
  AIStatus, AIUsage, Batch, BatchSummary, Brief, Config, ConnectRow, Directory, Entity, EvidenceGroup, Factor, FactorSuggestion, FactPreviewRow, FactValueRow,
  FileInfo, Message, Notice, Override, Preview, Ranking, Resource, ReviewResult, Session, SessionSummary, TaskOptions, TextbookHit, TRequest,
} from './types';
import { apiUrl } from './platform';

const WAKING = 'The server is waking up. Please wait a few seconds and try again.';
const BUSY = 'The system is busy right now. Please wait a minute and try again.';
/** The host sometimes answers with a "checking your browser" web page instead of data when many people use it at once. */
const isBusyPage = (res: Response) => (res.headers.get('content-type') || '').includes('text/html') || res.status === 429;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Looking things up can safely be tried again when the server is still waking up (it sleeps when nobody has used it for a while). */
async function run(url: string, init: RequestInit | undefined, safe: boolean): Promise<Response> {
  const tries = safe ? 5 : 1;
  for (let i = 0; i < tries; i++) {
    let res: Response;
    try { res = await fetch(url, init); } catch {
      if (i < tries - 1) { await sleep(2500 * (i + 1)); continue; }
      throw new Error('Could not reach the server. Check your internet connection and try again.');
    }
    if ([502, 503, 504].includes(res.status) && i < tries - 1) { await sleep(2500 * (i + 1)); continue; }
    if (isBusyPage(res)) { if (i < tries - 1) { await sleep(4000 * (i + 1)); continue; } throw new Error(BUSY); }
    return res;
  }
  throw new Error(WAKING);
}
async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const txt = await res.text();
    if ([502, 503, 504].includes(res.status) || /ROUTER_EXTERNAL_TARGET_ERROR|FUNCTION_INVOCATION|NOT_FOUND.*bom1/.test(txt)) throw new Error(WAKING);
    let msg = txt || res.statusText;
    try { const d = JSON.parse(txt); msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail ?? d); } catch { /* plain text */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}
const get = <T>(url: string) => run(apiUrl(url), undefined, true).then(j<T>);
const send = <T>(method: string, url: string, body?: unknown, safe = false) =>
  run(apiUrl(url), { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }, safe).then(j<T>);
const post = <T>(url: string, body?: unknown, safe = false) => send<T>('POST', url, body ?? {}, safe);
const form = <T>(url: string, fields: Record<string, string | number | null | undefined>, files: File[] | Blob[] = [], fileField = 'files', fileName?: string) => {
  const f = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined && v !== '') f.append(k, String(v)); });
  files.forEach((x) => f.append(fileField, x as Blob, fileName ?? (x as File).name ?? 'recording.webm'));
  return run(apiUrl(url), { method: 'POST', body: f }, false).then(j<T>);
};
const qs = (o: Record<string, string | number | boolean | null | undefined>) =>
  '?' + Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

export const api = {
  // ranking (original screens)
  config: () => get<Config>('/api/config'),
  ranking: (entity: Entity, weights?: Record<string, number>) => post<Ranking>('/api/ranking', { entity, weights }, true),
  evidence: (entity: Entity, id: string) => post<EvidenceGroup[]>('/api/evidence', { entity, id }, true),
  files: (schoolId: string) => get<FileInfo[]>(`/api/schools/${schoolId}/files`),
  preview: (fileId: string) => get<Preview>(`/api/files/${fileId}/preview`),
  rawUrl: (fileId: string) => apiUrl(`/api/files/${fileId}/raw`),
  pageUrl: (fileId: string, n: number) => apiUrl(`/api/files/${fileId}/page/${n}`),
  apply: (weights: Record<string, number>) => post<{ version: number }>('/api/config/apply', { weights }),

  directory: () => get<Directory>('/api/directory'),
  health: () => get<{ ok: boolean }>('/api/health'),

  factors: {
    list: () => get<{ factors: Factor[]; groups: string[] }>('/api/factors'),
    preview: (code: string, entity: Entity) => get<{ rows: FactPreviewRow[] }>(`/api/factors/${code}/preview${qs({ entity })}`),
    suggest: (description: string) => post<FactorSuggestion>('/api/factors/suggest', { description }),
    create: (body: Record<string, unknown>) => post<{ code: string; fact_key: string; values_saved: number }>('/api/factors', body),
    edit: (code: string, body: Record<string, unknown>) => send('PATCH', `/api/factors/${code}`, body),
    remove: (code: string) => send('DELETE', `/api/factors/${code}`),
    values: (key: string) => get<{ values: FactValueRow[] }>(`/api/facts/${key}`),
    saveValues: (key: string, values: { school_id: string; value: string | number }[]) => post<{ saved: number }>(`/api/facts/${key}`, { values }),
    uploadValues: (key: string, file: File) => form<{ saved: number; matched: unknown[]; unmatched: { row: number; text: string }[] }>(`/api/facts/${key}/upload`, {}, [file], 'file'),
  },

  overrides: {
    list: () => get<Override[]>('/api/overrides'),
    add: (body: { entity_type: Entity; id: string; action: Override['action']; points?: number; reason: string; expires_on?: string | null }) => post<{ id: string }>('/api/overrides', body),
    remove: (id: string) => send('DELETE', `/api/overrides/${id}`),
  },

  uploads: {
    recent: () => get<BatchSummary[]>('/api/uploads'),
    send: (files: File[], hints: { school_id?: string; teacher_id?: string; section?: string } = {}) => form<Batch>('/api/uploads', hints, files),
    get: (id: string) => get<Batch>(`/api/uploads/${id}`),
    editItem: (id: string, body: Partial<{ school_id: string | null; teacher_id: string | null; section: string; record_date: string; status: string }>) =>
      send('PATCH', `/api/uploads/items/${id}`, body),
    import: (id: string) => post<{ queued: number }>(`/api/uploads/${id}/import`),
  },

  visits: {
    brief: (p: { teacher_id?: string; school_id?: string }, fast = false) => get<Brief>(`/api/brief${qs({ ...p, fast: fast || undefined })}`),
    start: (body: { school_id?: string; teacher_id?: string; class_no?: number | null; subject?: string; topic?: string; brief_text?: Brief['brief']; brief_by?: string | null }) => post<Session>('/api/sessions', body),
    get: (id: string) => get<Session>(`/api/sessions/${id}`),
    list: (p: { teacher_id?: string; school_id?: string } = {}) => get<SessionSummary[]>(`/api/sessions${qs(p)}`),
    edit: (id: string, body: Record<string, unknown>) => send<Session>('PATCH', `/api/sessions/${id}`, body),
    addMedia: (id: string, file: Blob, kind: string, extra: { question_index?: number; student_label?: string } = {}, name?: string) =>
      form<Session>(`/api/sessions/${id}/media`, { kind, ...extra }, [file], 'file', name),
    removeMedia: (id: string, mid: string) => send<Session>('DELETE', `/api/sessions/${id}/media/${mid}`),
    questions: (id: string) => post<Session>(`/api/sessions/${id}/questions`),
    evaluate: (id: string) => post<Session>(`/api/sessions/${id}/evaluate`),
    reportUrl: (id: string, download = false) => apiUrl(`/api/sessions/${id}/report.pdf${download ? '?download=true' : ''}`),
    sendReport: (id: string, email?: string) => post<{ app: boolean; email: 'sent' | 'not_set_up' | 'failed' | 'skipped'; message: string; to: string }>(`/api/sessions/${id}/report/send`, { email: email || null }),
    save: (id: string, body: { growth?: number[]; next_steps?: number[] }) => post<{ visit_id: string; observations: number; resolved: number; actions: number }>(`/api/sessions/${id}/save`, body),
  },

  textbooks: {
    search: (p: { q: string; class_no?: number | null; subject?: string; board?: string; language?: string }) => get<{ results: TextbookHit[]; found_by: string }>(`/api/textbooks/search${qs(p)}`),
    add: (body: { teacher_id?: string; school_id?: string; url: string; title: string; class_no?: number | null; subject?: string | null; publisher?: string; kind?: string }) =>
      post<{ id: string }>('/api/resources', body),
    list: (p: { teacher_id?: string; school_id?: string }) => get<Resource[]>(`/api/resources${qs(p)}`),
    remove: (id: string) => send('DELETE', `/api/resources/${id}`),
  },

  connect: {
    overview: () => get<ConnectRow[]>('/api/connect/overview'),
    request: (body: { teacher_ids?: string[]; school_id?: string; kind: string; title?: string; message?: string; due_date?: string; visit_date?: string;
                      items?: { kind: string; title?: string; instructions?: string }[] }) => post<{ created: number }>('/api/requests', body),
    taskOptions: () => get<TaskOptions>('/api/task-options'),
    review: (itemId: string, body: { action: 'accept' | 'reject'; remark?: string; add_to?: string; scope?: 'teacher' | 'school' }) =>
      post<ReviewResult>(`/api/task-items/${itemId}/review`, body),
    uploadedFileUrl: (uploadItemId: string) => apiUrl(`/api/uploads/items/${uploadItemId}/raw`),
    requests: (p: { teacher_id?: string; status?: string } = {}) => get<TRequest[]>(`/api/requests${qs(p)}`),
    setRequest: (id: string, status: string) => send('PATCH', `/api/requests/${id}`, { status }),
    messages: (tid: string) => get<Message[]>(`/api/teachers/${tid}/messages`),
    send: (tid: string, body: string) => post<Message[]>(`/api/teachers/${tid}/messages`, { body }),
    notifications: () => get<Notice[]>('/api/notifications'),
    readAll: () => post('/api/notifications/read'),
  },

  ai: {
    status: () => get<AIStatus>('/api/ai/status'),
    test: () => post<Record<string, { ok: boolean | null; message: string }>>('/api/ai/test'),
    usage: (days = 30) => get<AIUsage>(`/api/ai/usage${qs({ days })}`),
    ask: (question: string, scope: { school_id?: string; teacher_id?: string } = {}) => post<{ answer: string; records_used: string[]; answered_by: string }>('/api/ask', { question, ...scope }),
  },
};
