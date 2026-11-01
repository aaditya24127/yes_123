// Types for the real-world features: factors, uploads, visits, connect, AI settings. Mirrors the backend JSON.
import type { Band, Category, Entity } from './types';

export interface LibraryCategory extends Category { group?: string; scope?: 'school' | 'teacher' | 'both'; data_hint?: string }
export interface Factor {
  code: string; label: string; name: string; description: string; group: string; scope: 'school' | 'teacher' | 'both'; status: string; builtin: boolean;
  proposed_by: string; data_hint: string | null; weight: number; uses_fact: string | null; rule: Record<string, unknown> | null; schools_with_data: number | null;
}
export type FactorMode = 'higher' | 'lower' | 'below_target' | 'above_target' | 'yes';
export interface FactorSuggestion {
  existing_code: string | null; name: string; description: string; fact_key: string; fact_label: string; unit: string | null; entity_scope: 'school' | 'teacher' | 'both';
  mode: FactorMode; low: number | null; high: number | null; target: number | null; explanation: string; suggested_by: string;
}
export interface FactPreviewRow { id: string; name: string; school_code: string; score: number | null; status: string; explanation: string }
export interface FactValueRow { school_id: string; school_code: string; school_name: string; value: number | string | null; as_of: string | null; source: string | null }
export interface Override {
  id: string; entity_type: Entity; school_id: string; teacher_id: string | null; action: 'pin_top' | 'adjust' | 'hold'; points: number; reason: string;
  school_name: string; teacher_name: string | null;
}
export interface DirSchool { id: string; code: string; name: string; board: string; medium: string; grade_from: number; grade_to: number; village: string }
export interface DirTeacher { id: string; school_id: string; teacher_code: string; name: string; designation: string; classes_taught: number[]; subjects_taught: string[] }
export interface Directory { schools: DirSchool[]; teachers: DirTeacher[] }

export type UploadStatus = 'sorted' | 'needs_attention' | 'duplicate' | 'skipped' | 'importing' | 'imported' | 'failed';
export interface UploadItem {
  id: string; name: string; format: string; size: number; school_id: string | null; school_name: string | null; school_code: string | null; teacher_id: string | null;
  teacher_name: string | null; section: string | null; record_date: string | null; kind: string | null; confidence: number; sorted_by: string | null; reasons: string[];
  preview: string | null; status: UploadStatus; error: string | null; source_file_id: string | null;
  result: { counts?: Record<string, number | string>; warnings?: string[]; read_by?: string; transcribed_by?: string };
}
export interface Batch { id: string; status: string; origin: string; created_at: string; counts: Record<string, number>; items: UploadItem[] }
export interface BatchSummary { id: string; created_at: string; status: string; origin: string; note: string | null; files: number; imported: number; attention: number }

export interface Brief {
  who: string; entity: Entity; school: { id: string; code: string; name: string; board: string; medium: string; grades: string; village: string };
  teacher: { id: string; name: string; designation: string; classes: number[]; subjects: string[]; joined: string | null; email?: string | null } | null;
  scores: { score: number | null; band: Band | null; rank: number | null; flags: string[]; categories: { label: string; score: number | null; contribution: number | null; explanation: string }[] } | null;
  alerts: string[]; open_issues: { ref: string; label?: string; severity?: string; issue: string; since: string; last_seen: string }[]; strengths_seen: { point: string; date: string }[];
  open_actions: { action: string; due: string; overdue_days: number }[]; latest_results: { cls: number; subject: string; skill: string | null; below_pct: number; date: string }[];
  last_visit: string | null; visit_count: number; previous_sessions: { date: string; topic: string | null; overall: string | null; next_steps: string[] }[];
  textbooks: { title: string; cls: number | null; subject: string | null; url: string | null }[]; pending_requests: { title: string; kind: string; status: string; due: string | null }[];
  brief: { summary: string; focus_points: string[]; ask_teacher: string[]; check_in_class: string[] } | null; brief_by: string | null;
}
export interface Question { question: string; level: string; good_answer: string; watch_for: string; ask_who: string }
export interface Media {
  id: string; kind: string; question_index: number | null; student_label: string | null; file_id: string | null; name: string | null; duration: number | null;
  transcript: string | null; transcript_by: string | null;
}
export interface Evaluation {
  overall: string; rubric: { element: string; score: number | null; evidence: string }[]; strengths: { point: string; evidence: string }[];
  growth: { area: string; evidence: string; why: string; try_this: string; source: string; need_code: string; severity: string }[];
  students: { summary: string; per_question: { question: string; verdict: string; note: string }[]; misconceptions: string[] };
  compared_with_before: { issue: string; change: 'improved' | 'same' | 'worse' | 'not_seen'; evidence: string }[];
  next_steps: { action: string; who: string; due_in_days: number }[]; confidence: 'high' | 'medium' | 'low'; confidence_reason: string; safety_flag: string | null;
  evaluated_by?: string; error?: string;
}
export interface Session {
  id: string; school_id: string; teacher_id: string | null; class_no: number | null; subject: string | null; topic: string | null; stage: number; status: string;
  brief: Brief; crp_notes: string | null; changes_since_last: string | null; questions: Question[]; result: Partial<Evaluation>; media: Media[];
  started_at: string; job: { status: string; error: string | null; provider: string | null } | null; visit_id: string | null; question_tips?: string[]; questions_by?: string;
  followup_days: number; report_sent_at: string | null; report_sent_to: string | null;
}
export interface SessionSummary { id: string; started_at: string; status: string; stage: number; class_no: number | null; subject: string | null; topic: string | null; school_name: string; teacher_name: string | null }
export interface TextbookHit { title: string; url: string; publisher: string; is_pdf: boolean; class_no: number | null; subject: string | null; language: string | null }
export interface Resource {
  id: string; title: string; source_url: string | null; publisher: string | null; class_no: number | null; subject: string | null; status: string; pages: number | null;
  chapters: number; source_file_id: string | null; teacher_id: string | null;
}

export interface ConnectRow {
  id: string; full_name: string; title: string; designation: string; school_id: string; school_name: string; school_code: string; open_requests: number; submitted: number;
  unread: number; last_message: string | null; email: string | null;
}
export interface TaskFile { id: string; name: string; size: number; format: string; status: string; created_at: string }
export interface TaskItem {
  id: string; position: number; title: string; instructions: string | null; kind: string; status: 'open' | 'submitted' | 'accepted' | 'rejected';
  response_text: string | null; review_remark: string | null; added_to: string | null; submitted_at: string | null; reviewed_at: string | null; files: TaskFile[];
}
export interface TaskOptions { kinds: { code: string; label: string; default_add_to: string | null }[]; add_to: { code: string; label: string }[] }
export interface ReviewResult { ok: boolean; status: 'accepted' | 'rejected'; queued: number; skipped_duplicates: number }
export interface TRequest {
  id: string; teacher_id: string; teacher_name?: string; school_name?: string; kind: string; title: string; message: string | null; due_date: string | null;
  visit_date: string | null; status: string; response_text: string | null; batch_id: string | null; created_at: string; responded_at: string | null;
  items: TaskItem[];
}
export interface Message { id: string; sender: 'crp' | 'teacher' | 'system'; body: string; created_at: string; read_at: string | null; request_id: string | null; is_concern?: boolean }
export interface Notice { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null }

export interface AIStatus {
  providers: Record<string, { type?: string; model?: string | null; available: boolean; reason: string; note?: string | null }>;
  tasks: Record<string, { chain: string[]; will_use: string | null; description: string }>;
}
export interface AIUsage {
  days: number; cost_usd: number; calls: number; failed: number; all_time_cost_usd: number; all_time_calls: number;
  by_task: { task: string; provider: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost: number; failed: number }[];
}
