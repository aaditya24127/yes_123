-- CRP logins for the CRP app (email + password), the same way teachers sign in to the teacher app.
-- Passwords are stored only as salted hashes (never as text). The demo account (DEMO_CRP_EMAIL / DEMO_CRP_PASSWORD) is created
-- when the API starts; accounts people make themselves go through exactly the same table and the same checks.
create table if not exists crp_accounts (
    id             uuid primary key default gen_random_uuid(),
    crp_id         uuid not null references crps (id) on delete cascade,      -- the cluster this person works on
    email          text not null unique,
    password_hash  text not null,
    full_name      text not null,
    title          text constraint crp_accounts_title_chk check (title in ('Mr.', 'Mrs.', 'Ms.')),   -- also how the tutorial greets them (sir / ma'am); empty = neither
    is_demo        boolean not null default false,
    last_login     timestamptz,
    created_at     timestamptz not null default now()
);
