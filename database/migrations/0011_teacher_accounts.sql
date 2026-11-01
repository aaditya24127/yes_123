-- Teacher app logins (email + password) replace the old private links.
-- Passwords are stored only as salted hashes (never as text); the demo password comes from DEMO_TEACHER_PASSWORD when accounts are created.
create table if not exists teacher_accounts (
    teacher_id     uuid primary key references teachers (id),
    email          text not null unique,
    password_hash  text not null,
    last_login     timestamptz,
    created_at     timestamptz not null default now()
);

-- A message a teacher sends as a concern (shown with a tag on the CRP's Teachers page).
alter table messages add column if not exists is_concern boolean not null default false;

-- The old no-password links are gone.
drop table if exists teacher_links;
