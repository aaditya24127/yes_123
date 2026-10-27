-- Processing jobs (ingestion, OCR, transcription, LLM) and audit trail.

create table processing_jobs (
    id              uuid primary key default gen_random_uuid(),
    source_file_id  uuid references source_files (id) on delete cascade,
    job_type        text not null constraint processing_jobs_type_chk check (job_type in ('detect', 'parse', 'ocr', 'transcribe', 'extract', 'validate', 'embed')),
    status          text not null default 'queued' constraint processing_jobs_status_chk check (status in ('queued', 'processing', 'awaiting_review', 'completed', 'failed')),
    progress_pct    numeric(5, 2) not null default 0,
    attempts        smallint not null default 0,
    provider        text,                                  -- which model/service actually handled it (fallback reporting)
    error           text,
    meta            jsonb not null default '{}'::jsonb,    -- e.g. audio chunk list for 30-35 minute recordings
    created_at      timestamptz not null default now(),
    started_at      timestamptz,
    finished_at     timestamptz
);
create index processing_jobs_status_idx on processing_jobs (status, created_at);
create index processing_jobs_file_idx on processing_jobs (source_file_id);

create table audit_logs (
    id           uuid primary key default gen_random_uuid(),
    actor_crp_id uuid references crps (id),
    action       text not null,
    entity_type  text,
    entity_id    uuid,
    details      jsonb not null default '{}'::jsonb,
    created_at   timestamptz not null default now()
);
create index audit_logs_entity_idx on audit_logs (entity_type, entity_id);
create index audit_logs_created_idx on audit_logs (created_at);
