-- Supabase only (skipped on a local server). Same lock-down as 0010 for the teacher login table: row-level security ON and no
-- policy, so nobody can read the password hashes through Supabase's public API; the FastAPI backend connects as the owner.
alter table if exists teacher_accounts enable row level security;
