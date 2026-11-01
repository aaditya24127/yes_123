-- Supabase only (skipped on a local server). Same lock-down as 0010 / 0012: row-level security ON and no policy, so the push
-- addresses and keys cannot be read through Supabase's public API; the FastAPI backend connects as the owner.
alter table if exists push_subscriptions enable row level security;
