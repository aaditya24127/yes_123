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
export interface DirTeacher { id: string; school_id: string; teacher_code: string; name: string; designation: string; classes_taught: number[]; subjects_taught: string[]; phone?: string | null }
export interface Directory { schools: DirSchool[]; teachers: DirTeacher[] }

export type UploadStatus = 'sorted' | 'needs_attention' | 'duplicate' | 'skipped' | 'importing' | 'imported' | 'failed';
export interface UploadItem {
  id: string; name: string; format: string; size: number; school_id: string | null; school_name: string | null; school_code: string | null; teacher_id: string | null;
  teacher_name: string | null; section: string | null; record_date: string | null; kind: string | null; confidence: number; sorted_by: string | null; reasons: string[];
  preview: string | null; status: UploadStatus; error: string | null; source_file_id: string | null;
  result: { counts?: Record<string, number | string>; warnings?: string[]; read_by?: string; transcribed_by?: string };
  detected?: Detected | null;
}
/** What the sorter found in a file whose school is not on the list: a new school (with its teachers and data), or no school at all. */
/** What is inside the file, read the same way Import reads it. */
export interface FoundData {
  by: string; visit_date?: string | null; summary: string | null; observations: { text: string; where: string | null; level: string | null }[]; actions: { text: string; due: string | null }[];
  results: string[]; facts: string[]; notes: string[]; counts?: { observations: number; actions: number; results: number; facts: number };
}
export type Detected =
  | { kind: 'new_school'; school: { name: string; school_type: string; board: string; medium: string; grade_from: number; grade_to: number }; teachers: string[];
      data: { section: string | null; record_date: string | null; table_rows: number | null; found?: FoundData } }
  | { kind: 'no_school' };
export interface Batch { id: string; status: string; origin: string; created_at: string; counts: Record<string, number>; items: UploadItem[] }
export interface BatchSummary { id: string; created_at: string; status: string; origin: string; note: string | null; files: number; imported: number; attention: number }

export interface Brief {
  who: string; entity: Entity; school: { id: string; code: string; name: string; board: string; medium: string; grades: string; village: string };
  teacher: { id: string; name: string; designation: string; classes: number[]; subjects: string[]; joined: string | null; email?: string | null } | null;
  scores: { score: number | null; band: Band | null; rank: number | null; flags: string[]; categories: { label: string; score: number | null; contribution: number | null; explanation: string }[] } | null;
  alerts: string[]; open_issues: { ref: string; label?: string; severity?: string; subject?: string | null; class_label?: string | null; issue: string; since: string; last_seen: string }[]; strengths_seen: { point: string; date: string; subject?: string | null; class_label?: string | null }[];
  open_actions: { action: string; due: string; overdue_days: number }[]; latest_results: { cls: number; subject: string; skill: string | null; below_pct: number; date: string }[];
  last_visit: string | null; visit_count: number; previous_sessions: { date: string; topic: string | null; subject?: string | null; cls?: number | null; overall: string | null; next_steps: string[] , mentor?: string | null;
    strengths?: string[]; growth?: { area: string; try_this: string | null }[]; reasons?: { issue: string; teacher_action: string | null }[]; notes?: string }[];
  school_history?: { date: string; kind: string; cls: number | null; subject: string | null; mentor: string | null; topic: string | null; teacher: string | null; overall: string | null }[];
  textbooks: { title: string; cls: number | null; subject: string | null; url: string | null }[]; pending_requests: { title: string; kind: string; status: string; due: string | null }[];
  brief: { summary: string; focus_points: string[]; ask_teacher: string[]; check_in_class: string[] } | null; brief_by: string | null;
  /** The teacher's newest spoken assessment (last 120 days), if any. */
  assessment?: { id: string; date: string; subject: string; class_no: number | null; chapter: string; scores: { knowledge: number | null; teaching: number | null; overall: number | null; confidence: number | null } | null; focus: string[]; reliability: string | null } | null;
}
export interface Question { question: string; level: string; good_answer: string; watch_for: string; ask_who: string }
export interface Media {
  id: string; kind: string; question_index: number | null; student_label: string | null; file_id: string | null; name: string | null; duration: number | null;
  transcript: string | null; transcript_by: string | null;
}
export interface Evaluation {
  overall: string; rubric: { element: string; score: number | null; evidence: string }[]; strengths: { point: string; evidence: string }[];
  growth: { area: string; evidence: string; why: string; try_this: string; source: string; need_code: string; severity: string }[];
  students: { summary: string; per_question: { question: string; verdict: string; note: string; mentor?: MentorCheck }[]; misconceptions: string[]; reasons?: { issue: string; evidence: string; likely_reason: string; teacher_action: string }[] };
  compared_with_before: { issue: string; change: 'improved' | 'same' | 'worse' | 'not_seen'; evidence: string }[];
  next_steps: { action: string; who: string; due_in_days: number }[]; confidence: 'high' | 'medium' | 'low'; confidence_reason: string; safety_flag: string | null;
  evaluated_by?: string; error?: string;
}
/** The mentor's check of the AI's verdict on one student answer (the AI's own verdict is kept beside it). */
export interface MentorCheck { verdict: 'agree' | 'correct' | 'partly' | 'wrong'; reason: string | null; by: string | null; at: string }
/** The spoken review of a visit: a short voice message in the teacher's language (about a minute). */
export interface VoiceInfo { language: string; voice_language: string | null; gender: 'male' | 'female'; voice: string; script: string; seconds: number; made_at: string | null; url: string; by?: string | null }
export interface WhatsAppResult { mode: 'sent' | 'link' | 'failed'; message: string; to: string; voice: boolean; link: string }
export interface Session {
  voice?: VoiceInfo | null; teacher_phone?: string | null;
  id: string; school_id: string; teacher_id: string | null; class_no: number | null; subject: string | null; topic: string | null; stage: number; status: string;
  brief: Brief; crp_notes: string | null; changes_since_last: string | null; questions: Question[]; result: Partial<Evaluation>; media: Media[];
  started_at: string; job: { status: string; error: string | null; provider: string | null } | null; visit_id: string | null; question_tips?: string[]; questions_by?: string;
  followup_days: number; report_sent_at: string | null; report_sent_to: string | null; mentor_name?: string | null;
}
export interface SessionSummary { mentor_name?: string | null; id: string; started_at: string; status: string; stage: number; class_no: number | null; subject: string | null; topic: string | null; school_name: string; teacher_name: string | null }
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
  days: number; cost_usd: number; calls: number; failed: number; all_time_cost_usd: number; all_time_calls: number; budget_usd?: number | null;
  by_key: { id: string; label: string; env: string; note: string; plan: 'paid' | 'free'; key_set: boolean; calls: number; failed: number; tokens_in: number; tokens_out: number; cost_usd: number; calls_recent: number; cost_recent_usd: number }[];
  by_task: { task: string; provider: string; model: string; calls: number; input_tokens: number; output_tokens: number; cost: number; failed: number }[];
}

/** Where the data of an uploaded file goes (GET /api/uploads/items/{id}/allocation): one row per priority. */
export interface AllocationRow { code: string; priority: string; takes: string; records: number | null; example: string | null; counted: 'yes' | 'no' | 'after_import'; note: string | null }
export interface Allocation { state: 'expected' | 'done'; rows: AllocationRow[]; nothing?: boolean }

/** Chapter lists per board / class / subject (GET /api/curriculum). `note` says when the list is a nearest match; `books` can be empty (then the chapter is typed). */
export interface CurriculumBook { book: string; edition: 'current' | 'older'; chapters: string[]; source: string | null; read_from: string | null; medium: string; board: string }
export interface Curriculum { books: CurriculumBook[]; note: string | null; board: string | null; own_board: string | null; board_label: string | null; count: number }

/** The spoken before-visit assessment (CRP side). */
export type AssessmentStatus = 'preparing' | 'ready' | 'in_progress' | 'submitted' | 'reported' | 'failed' | 'cancelled';
export interface AssessScores { knowledge: number | null; teaching: number | null; overall: number | null; confidence: number | null }
export interface AssessReport {
  scores: AssessScores; summary: string; strengths: string[]; changes: string[]; do: string[]; dont: string[]; visit_focus: string[];
  better_methods: { idea: string; why: string }[];
  questions: { n: number; kind: 'knowledge' | 'teaching'; question: string; score: number; said: string; comment: string; confidence: { score: number | null; band: string } }[];
  tools: { name: string; kind: string; fits: string; note: string }[];
  misconceptions: { misconception: string; fix_given: string; fix_is: string; note: string }[];
  checking_understanding: { rating: string; note: string }; weaker_students: { rating: string; note: string }; board_class_fit: { rating: string; note: string };
  speaking: { avg_wpm: number | null; pauses: number; longest_pause: number; fillers: number; hedges: number };
  data_quality: { answered: number; total: number; reliability: string; note: string };
  context?: { teacher?: string };
}
export interface Assessment {
  id: string; teacher_id: string; teacher_name?: string | null; status: AssessmentStatus; subject: string; class_no: number | null; chapter: string; count: number; ai_choice: string;
  requested_by: string | null; requested_at: string; ready_at: string | null; started_at: string | null; submitted_at: string | null; reported_at: string | null;
  answered: number; questions_by: string | null; report_by: string | null; error: string | null; scores: AssessScores | null;
  questions?: { n: number; kind: string; question: string }[]; report?: AssessReport | null;
}
export type AiChoice = 'auto' | 'claude' | 'free';
