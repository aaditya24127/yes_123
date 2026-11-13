-- Supabase only (skipped on a local server). Same lock-down as 0012 for the CRP login table: row-level security ON and no
-- policy, so nobody can read the password hashes through Supabase's public API; the FastAPI backend connects as the owner.
alter table if exists crp_accounts enable row level security;
