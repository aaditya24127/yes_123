-- Supabase only (skipped on a local server). Same lock-down as the other tables: row-level security ON and no policy, so nothing is readable through
-- Supabase's public API; the FastAPI backend connects as the owner.
alter table if exists teacher_assessments enable row level security;
