export type Entity = 'school' | 'teacher';
export type Band = 'critical' | 'high' | 'medium' | 'low';

export interface Category {
  code: string; label: string; name: string; description: string;
}
export interface Config {
  version: number; as_of: string; bands: Record<string, number>; categories: Category[]; weights: Record<string, number>;
}
export interface CatScore {
  code: string; label: string; name: string; score: number | null; status: 'verified' | 'provisional' | 'unknown' | 'review';
  weight: number; contribution: number | null; explanation: string;
}
export interface Item {
  entity: Entity; id: string; school_id: string; school_name: string; school_code: string; name: string; subtitle: string; location: string; grades: string;
  score: number | null; band: Band | null; rank: number | null; coverage: number; provisional: boolean; insufficient: boolean; needs_review: boolean;
  flags: { code: string; label: string }[]; alerts: { type: string; days: number; message: string }[];
  categories: CatScore[]; reasons: string[]; headline: string;
}
export interface Ranking {
  entity: Entity; as_of: string; normalized_weights: Record<string, number>; items: Item[];
  summary: { critical: number; high: number; medium: number; low: number; insufficient: number; needs_review: number; total: number };
}
export interface EvidenceRecord {
  record_type: string; record_id: string; summary: string; date: string; locator: string | null;
  file: { id: string; name: string; format: string; section: string; kind: string } | null;
}
export interface EvidenceGroup { code: string; label: string; status: string; explanation: string; detail: Record<string, unknown>; records: EvidenceRecord[] }
export interface FileInfo {
  id: string; name: string; section: string; format: string; kind: string; scanned: boolean; record_date: string; size: number; status: string;
  duplicate_of: string | null; feeds: string[]; duration: number | null;
}
export interface Highlight { type: string; locator: string | null; text: string | null; status: string }
export interface Preview {
  id: string; name: string; format: string; kind: string; scanned: boolean; highlights: Highlight[];
  view: 'sheets' | 'doc' | 'text' | 'pdf' | 'image' | 'audio';
  pages?: number; sheets?: { name: string; rows: string[][] }[]; paragraphs?: string[]; tables?: string[][][]; text?: string;
}

