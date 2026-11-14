-- The before-visit teaching assessment. The CRP asks for it in the Visit page (step "before class"); the teacher answers by voice in the teacher app;
-- a report is made for both of them.
--   questions: [{n, kind: 'knowledge'|'teaching', question, expected_points: [...], common_mistakes: [...]}]  (the points are for the mentor; the teacher app never receives them)
--   answers:   [{n, text, source: 'voice'|'typed', seconds, words, wpm, pauses, longest_pause, fillers, hedges}]  (the recordings themselves are never stored)
--   report:    scores, per-question notes, suggestions, speaking data, data quality (see services/assessment.py)
create table if not exists teacher_assessments (
    id              uuid primary key default gen_random_uuid(),
    school_id       uuid not null references schools (id),
    teacher_id      uuid not null references teachers (id),
    requested_by    text,
    board           text,
    medium          text,
    class_no        smallint,
    subject         text,
    chapter         text,
    question_count  smallint not null constraint teacher_assessments_count_chk check (question_count between 5 and 10),
    ai_choice       text not null default 'auto' constraint teacher_assessments_ai_chk check (ai_choice in ('auto', 'claude', 'free')),
    status          text not null default 'preparing'
                    constraint teacher_assessments_status_chk check (status in ('preparing', 'ready', 'in_progress', 'submitted', 'reported', 'cancelled', 'failed')),
    questions       jsonb not null default '[]'::jsonb,
    answers         jsonb not null default '[]'::jsonb,
    report          jsonb not null default '{}'::jsonb,
    questions_by    text,
    report_by       text,
    error           text,
    requested_at    timestamptz not null default now(),
    ready_at        timestamptz,
    started_at      timestamptz,
    submitted_at    timestamptz,
    reported_at     timestamptz
);
create index if not exists teacher_assessments_teacher_idx on teacher_assessments (teacher_id, requested_at desc);
create index if not exists teacher_assessments_school_idx on teacher_assessments (school_id, requested_at desc);

-- background jobs for the two AI steps
alter table processing_jobs drop constraint if exists processing_jobs_type_chk;
alter table processing_jobs add constraint processing_jobs_type_chk check (job_type in
    ('detect', 'parse', 'ocr', 'transcribe', 'extract', 'validate', 'embed', 'import_item', 'evaluate_session', 'fetch_textbook', 'transcribe_media',
     'assessment_questions', 'assessment_report'));
