-- Every AI call (any provider: Claude, Gemini, local model, your own model, free rules) with tokens, approximate cost and time,
-- so the API budget is visible and you can compare providers.
create table if not exists llm_calls (
    id             uuid primary key default gen_random_uuid(),
    task           text not null,
    provider       text not null default '-',
    model          text not null default '-',
    input_tokens   integer not null default 0,
    output_tokens  integer not null default 0,
    cost_usd       numeric(10, 6) not null default 0,
    ok             boolean not null default true,
    error          text,
    seconds        numeric(8, 2),
    created_at     timestamptz not null default now()
);
create index if not exists llm_calls_created_idx on llm_calls (created_at);

-- Background jobs: any number of worker processes take jobs with "for update skip locked", so the work scales out.
alter table processing_jobs drop constraint if exists processing_jobs_type_chk;
alter table processing_jobs add constraint processing_jobs_type_chk check (job_type in
    ('detect', 'parse', 'ocr', 'transcribe', 'extract', 'validate', 'embed', 'import_item', 'evaluate_session', 'fetch_textbook', 'transcribe_media'));
alter table processing_jobs add column if not exists run_after timestamptz not null default now();
alter table processing_jobs add column if not exists locked_by text;
create index if not exists processing_jobs_queue_idx on processing_jobs (status, run_after) where status = 'queued';

-- upload items waiting in the job queue
alter table upload_items drop constraint if exists upload_items_status_chk;
alter table upload_items add constraint upload_items_status_chk check (status in ('sorted', 'needs_attention', 'duplicate', 'skipped', 'importing', 'imported', 'failed'));
alter table visit_sessions add column if not exists job_id uuid;
