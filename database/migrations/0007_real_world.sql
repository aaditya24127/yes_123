-- Real-world features: flexible factors + optional data, manual priority changes, bulk uploads, textbooks,
-- the 4-step visit evaluation, and CRP <-> teacher connection.

-- ---------------------------------------------------------------- factors
-- Any number of factors. Built-in ones point to a Python scorer; CRP-made ones use the generic 'fact_rule' scorer
-- (rule_params: {"fact_key": ..., "mode": "higher|lower|below_target|above_target|yes", "low": .., "high": .., "target": ..}).
alter table priority_categories add column if not exists entity_scope text not null default 'both'
    constraint priority_categories_scope_chk check (entity_scope in ('school', 'teacher', 'both'));
alter table priority_categories add column if not exists group_name text not null default 'Other';
alter table priority_categories add column if not exists sort_order integer not null default 100;
alter table priority_categories add column if not exists data_hint text;          -- plain words: what data this factor needs

-- 'na' = factor does not apply to this school/teacher (e.g. attendance for a teacher); it is left out of the weights.
alter table priority_category_scores drop constraint if exists priority_cat_scores_status_chk;
alter table priority_category_scores add constraint priority_cat_scores_status_chk check (status in ('verified', 'unknown', 'provisional', 'review', 'na'));
alter table priority_result_inputs drop constraint if exists priority_inputs_type_chk;
alter table priority_result_inputs add constraint priority_inputs_type_chk
    check (record_type in ('assessment', 'observation', 'follow_up', 'visit', 'attendance', 'fact', 'intervention', 'teacher'));

-- Extra numbers about a school or teacher (girls enrolled, children with special needs, toilets...). Optional: filled from
-- uploads or typed in when a CRP adds a factor. The latest value per key counts.
create table if not exists fact_definitions (
    key         text primary key,
    label       text not null,
    unit        text,
    entity_type text not null default 'school' constraint fact_definitions_entity_chk check (entity_type in ('school', 'teacher')),
    description text,
    created_at  timestamptz not null default now()
);

create table if not exists facts (
    id                uuid primary key default gen_random_uuid(),
    fact_key          text not null references fact_definitions (key) on update cascade,
    school_id         uuid not null references schools (id),
    teacher_id        uuid references teachers (id),
    value_num         numeric,
    value_text        text,
    as_of_date        date not null default current_date,
    source            text not null default 'manual' constraint facts_source_chk check (source in ('manual', 'upload', 'derived', 'teacher')),
    source_file_id    uuid references source_files (id),
    locator           text,
    validation_status text not null default 'valid' constraint facts_validation_chk check (validation_status in ('valid', 'needs_review', 'invalid')),
    created_at        timestamptz not null default now()
);
create index if not exists facts_school_key_idx on facts (school_id, fact_key, as_of_date);
create index if not exists facts_teacher_key_idx on facts (teacher_id, fact_key);

-- Manual changes to the list: pin to the top, push up/down by points, or hold back, always with a reason.
create table if not exists priority_overrides (
    id           uuid primary key default gen_random_uuid(),
    entity_type  text not null constraint priority_overrides_entity_chk check (entity_type in ('school', 'teacher')),
    school_id    uuid not null references schools (id),
    teacher_id   uuid references teachers (id),
    action       text not null constraint priority_overrides_action_chk check (action in ('pin_top', 'adjust', 'hold')),
    points       numeric(6, 2) not null default 0,    -- for 'adjust': + moves up, - moves down
    reason       text not null,
    created_by   text,
    active       boolean not null default true,
    expires_on   date,
    created_at   timestamptz not null default now()
);
create index if not exists priority_overrides_active_idx on priority_overrides (entity_type, active);

-- ---------------------------------------------------------------- uploads
alter table source_files drop constraint if exists source_files_section_chk;
alter table source_files add constraint source_files_section_chk check (section in
    ('assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'facts', 'textbooks', 'visit_session', 'teacher_upload', 'other'));
alter table source_files drop constraint if exists source_files_kind_chk;
alter table source_files add constraint source_files_kind_chk check (doc_kind in ('tabular', 'narrative', 'form', 'scanned', 'handwritten', 'audio', 'image', 'other'));
alter table source_files add column if not exists extracted_text text;        -- what the free readers / speech-to-text found
alter table source_files add column if not exists batch_id uuid;

-- One "drop everything here" upload. Items are sorted (school / teacher / type / date) and confirmed before import.
create table if not exists upload_batches (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),
    created_by  text,
    origin      text not null default 'crp' constraint upload_batches_origin_chk check (origin in ('crp', 'teacher', 'visit')),
    status      text not null default 'sorting' constraint upload_batches_status_chk
                    check (status in ('sorting', 'ready', 'importing', 'done', 'failed')),
    note        text
);

create table if not exists upload_items (
    id               uuid primary key default gen_random_uuid(),
    batch_id         uuid not null references upload_batches (id) on delete cascade,
    original_filename text not null,
    temp_path        text not null,                 -- storage key while waiting for confirmation
    size_bytes       bigint not null,
    sha256           char(64) not null,
    file_format      text not null,
    school_id        uuid references schools (id),
    teacher_id       uuid references teachers (id),
    section          text,
    record_date      date,
    doc_kind         text,
    confidence       numeric(4, 2) not null default 0,  -- 0..1, how sure the sorter is
    sorted_by        text,                              -- 'rules' | 'llm' | 'crp'
    reasons          jsonb not null default '[]'::jsonb,
    text_preview     text,
    status           text not null default 'sorted' constraint upload_items_status_chk
                         check (status in ('sorted', 'needs_attention', 'duplicate', 'skipped', 'imported', 'failed')),
    duplicate_of     uuid references source_files (id),
    source_file_id   uuid references source_files (id),
    result           jsonb not null default '{}'::jsonb,  -- how many records were read from it, warnings
    error            text,
    created_at       timestamptz not null default now()
);
create index if not exists upload_items_batch_idx on upload_items (batch_id);

-- ---------------------------------------------------------------- textbooks / syllabus, remembered per teacher + school
create table if not exists teaching_resources (
    id             uuid primary key default gen_random_uuid(),
    school_id      uuid not null references schools (id),
    teacher_id     uuid references teachers (id),
    class_no       smallint,
    subject        text,
    title          text not null,
    source_url     text,
    publisher      text,
    kind           text not null default 'textbook' constraint teaching_resources_kind_chk check (kind in ('textbook', 'syllabus', 'teacher_guide', 'other')),
    source_file_id uuid references source_files (id),  -- cached copy of the PDF, when it could be downloaded
    pages          integer,
    contents       jsonb not null default '[]'::jsonb, -- chapter list found in the PDF
    text_excerpt   text,                               -- first part of the text, given to the AI as reference
    status         text not null default 'linked' constraint teaching_resources_status_chk check (status in ('linked', 'downloaded', 'failed')),
    added_by       text,
    created_at     timestamptz not null default now()
);
create index if not exists teaching_resources_teacher_idx on teaching_resources (teacher_id);
create index if not exists teaching_resources_school_idx on teaching_resources (school_id);

-- ---------------------------------------------------------------- the 4-step visit evaluation
create table if not exists visit_sessions (
    id                 uuid primary key default gen_random_uuid(),
    school_id          uuid not null references schools (id),
    teacher_id         uuid references teachers (id),
    crp_id             uuid references crps (id),
    class_no           smallint,
    subject            text,
    topic              text,
    stage              smallint not null default 1 constraint visit_sessions_stage_chk check (stage between 1 and 4),
    status             text not null default 'in_progress' constraint visit_sessions_status_chk check (status in ('in_progress', 'evaluated', 'saved', 'cancelled')),
    brief              jsonb not null default '{}'::jsonb,   -- step 1 snapshot (what the CRP saw before class)
    crp_notes          text,
    changes_since_last text,
    questions          jsonb not null default '[]'::jsonb,   -- step 3 questions for students
    result             jsonb not null default '{}'::jsonb,   -- step 4 evaluation
    visit_id           uuid references visits (id),          -- set when the CRP saves the result into the records
    started_at         timestamptz not null default now(),
    evaluated_at       timestamptz
);
create index if not exists visit_sessions_teacher_idx on visit_sessions (teacher_id, started_at);

create table if not exists session_media (
    id              uuid primary key default gen_random_uuid(),
    session_id      uuid not null references visit_sessions (id) on delete cascade,
    kind            text not null constraint session_media_kind_chk check (kind in ('lesson_audio', 'crp_notes_file', 'student_answer', 'photo', 'other')),
    question_index  smallint,
    student_label   text,                  -- "Student A"; no names stored
    source_file_id  uuid references source_files (id),
    transcript      text,
    transcript_by   text,
    created_at      timestamptz not null default now()
);
create index if not exists session_media_session_idx on session_media (session_id);

-- ---------------------------------------------------------------- CRP <-> teacher
-- A private link a teacher can open on their phone (no password yet; can be switched off any time).
create table if not exists teacher_links (
    id          uuid primary key default gen_random_uuid(),
    teacher_id  uuid not null references teachers (id),
    token       text not null unique,
    active      boolean not null default true,
    created_at  timestamptz not null default now(),
    last_used   timestamptz
);

create table if not exists teacher_requests (
    id            uuid primary key default gen_random_uuid(),
    school_id     uuid not null references schools (id),
    teacher_id    uuid references teachers (id),
    kind          text not null constraint teacher_requests_kind_chk check (kind in
                      ('marks', 'syllabus_plan', 'lesson_plan', 'attendance', 'lesson_recording', 'student_work', 'reflection', 'visit_notice', 'other')),
    title         text not null,
    message       text,
    due_date      date,
    visit_date    date,
    status        text not null default 'open' constraint teacher_requests_status_chk check (status in ('open', 'submitted', 'accepted', 'cancelled')),
    response_text text,
    batch_id      uuid references upload_batches (id),
    created_by    text,
    created_at    timestamptz not null default now(),
    responded_at  timestamptz
);
create index if not exists teacher_requests_teacher_idx on teacher_requests (teacher_id, status);

create table if not exists messages (
    id           uuid primary key default gen_random_uuid(),
    teacher_id   uuid not null references teachers (id),
    sender       text not null constraint messages_sender_chk check (sender in ('crp', 'teacher', 'system')),
    body         text not null,
    request_id   uuid references teacher_requests (id),
    created_at   timestamptz not null default now(),
    read_at      timestamptz
);
create index if not exists messages_teacher_idx on messages (teacher_id, created_at);

create table if not exists notifications (
    id              uuid primary key default gen_random_uuid(),
    recipient_type  text not null constraint notifications_recipient_chk check (recipient_type in ('crp', 'teacher')),
    teacher_id      uuid references teachers (id),
    title           text not null,
    body            text,
    link            text,
    created_at      timestamptz not null default now(),
    read_at         timestamptz
);
create index if not exists notifications_recipient_idx on notifications (recipient_type, teacher_id, read_at);

-- ---------------------------------------------------------------- built-in fact definitions
insert into fact_definitions (key, label, unit, entity_type, description) values
 ('enrolment_total', 'Students enrolled', 'students', 'school', 'Total students on the school roll.'),
 ('girls_enrolled', 'Girls enrolled', 'students', 'school', 'Number of girls on the school roll.'),
 ('cwsn_enrolled', 'Children with special needs', 'students', 'school', 'Children with special needs (CWSN) on the roll.')
on conflict (key) do nothing;
