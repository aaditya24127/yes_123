import type { Config, Entity, EvidenceGroup, FileInfo, Preview, Ranking } from './types';

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.text()) || res.statusText);
  return res.json() as Promise<T>;
}
const post = (url: string, body: unknown) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  config: () => fetch('/api/config').then(j<Config>),
  ranking: (entity: Entity, weights?: Record<string, number>) => post('/api/ranking', { entity, weights }).then(j<Ranking>),
  evidence: (entity: Entity, id: string) => post('/api/evidence', { entity, id }).then(j<EvidenceGroup[]>),
  files: (schoolId: string) => fetch(`/api/schools/${schoolId}/files`).then(j<FileInfo[]>),
  preview: (fileId: string) => fetch(`/api/files/${fileId}/preview`).then(j<Preview>),
  rawUrl: (fileId: string) => `/api/files/${fileId}/raw`,
  apply: (weights: Record<string, number>) => post('/api/config/apply', { weights }).then(j<{ version: number }>),
};
