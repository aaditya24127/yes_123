-- Supabase only (skipped on a local server). Same lock-down as 0010 / 0012 / 0014: row-level security ON and no policy.
alter table if exists task_items enable row level security;
