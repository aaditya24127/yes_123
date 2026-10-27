-- CRP Mentor Copilot: core schema.
-- Plain PostgreSQL 14+ (gen_random_uuid is built in). Runs unchanged on a local server and on Supabase.
-- No dependency on Supabase's auth schema: app_users.auth_user_id is NULL locally and holds auth.users.id on Supabase.
-- Enumerations are text + CHECK constraints so values can be extended with a simple migration.

create table app_users (
    id            uuid primary key default gen_random_uuid(),
    auth_user_id  uuid unique,
    email         text unique,
    full_name     text not null,
    role          text not null default 'crp' constraint app_users_role_chk check (role in ('crp', 'admin', 'viewer')),
    is_demo       boolean not null default false,
    created_at    timestamptz not null default now()
);

create table crps (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid references app_users (id),
    code       text not null unique,
    full_name  text not null,
    cluster    text,
    block      text,
    district   text,
    is_demo    boolean not null default false,
    created_at timestamptz not null default now()
);

create table schools (
    id           uuid primary key default gen_random_uuid(),
    code         text not null unique,
    name         text not null,
    school_type  text not null,
    board        text not null,
    medium       text not null,
    grade_from   smallint not null,
    grade_to     smallint not null,
    village      text,
    taluka       text,
    district     text,
    udise_code   text,
    cluster      text,
    is_active    boolean not null default true,
    is_demo      boolean not null default false,
    created_at   timestamptz not null default now(),
    constraint schools_grades_chk check (grade_from between 1 and 12 and grade_to between grade_from and 12)
);

create table school_assignments (
    id           uuid primary key default gen_random_uuid(),
    crp_id       uuid not null references crps (id) on delete cascade,
    school_id    uuid not null references schools (id) on delete cascade,
    assigned_on  date,
    is_demo      boolean not null default false,
    unique (crp_id, school_id)
);

create table teachers (
    id              uuid primary key default gen_random_uuid(),
    school_id       uuid not null references schools (id),
    teacher_code    text not null unique,
    full_name       text not null,
    title           text,
    designation     text,
    qualification   text,
    joined_date     date,
    classes_taught  smallint[] not null default '{}',
    subjects_taught text[] not null default '{}',
    is_active       boolean not null default true,
    is_demo         boolean not null default false,
    created_at      timestamptz not null default now()
);
create index teachers_school_idx on teachers (school_id);

-- Every uploaded original. storage_path is relative to the storage root and is the object key on Supabase Storage.
create table source_files (
    id                    uuid primary key default gen_random_uuid(),
    school_id             uuid not null references schools (id),
    teacher_id            uuid references teachers (id),
    section               text not null constraint source_files_section_chk
                              check (section in ('assessments', 'observations', 'followups', 'visits', 'attendance', 'audio', 'roster', 'other')),
    original_filename     text not null,
    storage_path          text not null unique,
    mime_type             text,
    file_format           text not null,
    size_bytes            bigint not null,
    sha256                char(64) not null,
    doc_kind              text not null constraint source_files_kind_chk
                              check (doc_kind in ('tabular', 'narrative', 'form', 'scanned', 'handwritten', 'audio')),
    is_scanned            boolean not null default false,
    language              text not null default 'en',
    record_date           date,
    uploaded_at           timestamptz not null default now(),
    uploaded_by_crp_id    uuid references crps (id),
    duration_seconds      numeric(8, 1),
    processing_status     text not null default 'queued' constraint source_files_status_chk
                              check (processing_status in ('queued', 'processing', 'awaiting_review', 'validated', 'failed', 'duplicate_exact', 'possible_duplicate')),
    duplicate_of_file_id  uuid references source_files (id) deferrable initially deferred,
    notes                 text,
    is_demo               boolean not null default false
);
create index source_files_school_section_idx on source_files (school_id, section);
create index source_files_sha_idx on source_files (sha256);

create table visits (
    id              uuid primary key default gen_random_uuid(),
    school_id       uuid not null references schools (id),
    teacher_id      uuid references teachers (id),
    crp_id          uuid references crps (id),
    visit_date      date not null,
    visit_type      text not null constraint visits_type_chk check (visit_type in ('school_visit', 'classroom_observation')),
    class_no        smallint,
    subject         text,
    source_file_id  uuid references source_files (id),
    is_demo         boolean not null default false
);
create index visits_school_date_idx on visits (school_id, visit_date);
create index visits_teacher_idx on visits (teacher_id);

-- Class-level results. Invalid / conflicting rows are stored (flagged), never silently dropped.
create table assessments (
    id                uuid primary key default gen_random_uuid(),
    school_id         uuid not null references schools (id),
    teacher_id        uuid references teachers (id),
    teacher_name_raw  text,
    class_no          smallint not null,
    division          text,
    subject           text not null,
    skill             text,
    exam_type         text,
    assessment_date   date,
    max_marks         numeric(6, 1),
    benchmark_pct     numeric(5, 2) not null default 40,
    students_on_roll  integer,
    students_assessed integer,
    students_below    integer,
    class_avg_pct     numeric(5, 2),
    source_file_id    uuid references source_files (id),
    locator           text,
    evidence_text     text,
    validation_status text not null default 'valid' constraint assessments_validation_chk
                          check (validation_status in ('valid', 'invalid', 'needs_review', 'conflict', 'duplicate')),
    validation_note   text,
    is_duplicate_of   uuid references assessments (id) deferrable initially deferred,
    is_demo           boolean not null default false,
    constraint assessments_nonneg_chk check (coalesce(students_on_roll, 0) >= 0 and coalesce(students_assessed, 0) >= 0 and coalesce(students_below, 0) >= 0)
);
create index assessments_school_date_idx on assessments (school_id, assessment_date);
create index assessments_teacher_idx on assessments (teacher_id);
create index assessments_file_idx on assessments (source_file_id);

create table observations (
    id                uuid primary key default gen_random_uuid(),
    school_id         uuid not null references schools (id),
    teacher_id        uuid references teachers (id),
    visit_id          uuid references visits (id),
    observation_date  date not null,
    need_code         text not null,
    issue_text        text not null,
    severity          text not null constraint observations_severity_chk check (severity in ('none', 'minor', 'significant', 'critical')),
    status            text not null default 'open' constraint observations_status_chk check (status in ('open', 'in_progress', 'resolved', 'n/a')),
    resolved_on       date,
    class_label       text,
    subject           text,
    extraction_origin text not null default 'document' constraint observations_origin_chk check (extraction_origin in ('document', 'audio_transcript', 'manual')),
    source_file_id    uuid references source_files (id),
    locator           text,
    evidence_text     text,
    validation_status text not null default 'valid' constraint observations_validation_chk
                          check (validation_status in ('valid', 'invalid', 'needs_review', 'conflict', 'duplicate')),
    is_duplicate_of   uuid references observations (id) deferrable initially deferred,
    is_demo           boolean not null default false
);
create index observations_school_date_idx on observations (school_id, observation_date);
create index observations_teacher_idx on observations (teacher_id);
create index observations_need_idx on observations (need_code);
create index observations_file_idx on observations (source_file_id);

create table interventions (
    id                  uuid primary key default gen_random_uuid(),
    school_id           uuid not null references schools (id),
    teacher_id          uuid references teachers (id),
    observation_id      uuid references observations (id),
    created_on          date not null,
    recommended_action  text not null,
    approved_action     text,
    responsible         text,
    planned_completion  date,
    status              text not null default 'proposed' constraint interventions_status_chk
                            check (status in ('proposed', 'approved', 'in_progress', 'completed', 'not_completed', 'rejected')),
    source_file_id      uuid references source_files (id),
    locator             text,
    is_demo             boolean not null default false
);
create index interventions_school_idx on interventions (school_id);

create table follow_ups (
    id                         uuid primary key default gen_random_uuid(),
    intervention_id            uuid references interventions (id),
    school_id                  uuid not null references schools (id),
    teacher_id                 uuid references teachers (id),
    due_date                   date not null,
    status                     text not null default 'open' constraint follow_ups_status_chk check (status in ('open', 'completed', 'not_completed', 'cancelled')),
    completed_date             date,
    completion_evidence        text,
    completion_source_file_id  uuid references source_files (id),
    completion_locator         text,
    is_demo                    boolean not null default false
);
create index follow_ups_school_due_idx on follow_ups (school_id, due_date, status);
create index follow_ups_teacher_idx on follow_ups (teacher_id);

create table attendance (
    id                  uuid primary key default gen_random_uuid(),
    school_id           uuid not null references schools (id),
    month               text not null constraint attendance_month_chk check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
    working_days        smallint,
    avg_attendance_pct  numeric(5, 2) not null,
    target_pct          numeric(5, 2) not null default 90,
    source_file_id      uuid references source_files (id),
    locator             text,
    is_demo             boolean not null default false,
    unique (school_id, month)
);
