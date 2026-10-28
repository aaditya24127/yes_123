-- Supabase only (skipped on a local server). Locks down the tables added in 0007-0009 the same way as 0005:
-- row-level security ON and no policy = nobody can read or write them through Supabase's public API (anon / logged-in
-- clients); the FastAPI backend connects as the database owner and is unaffected. Policies for direct client access
-- (for example teachers reading their own requests) can be added later, when logins exist.

do $$
declare t text;
begin
    foreach t in array array['fact_definitions', 'facts', 'priority_overrides', 'upload_batches', 'upload_items', 'teaching_resources',
                             'visit_sessions', 'session_media', 'teacher_links', 'teacher_requests', 'messages', 'notifications',
                             'llm_calls', 'schema_migrations']
    loop
        if to_regclass('public.' || t) is not null then
            execute format('alter table %I enable row level security', t);
        end if;
    end loop;
end $$;

-- A view normally runs with its owner's rights, which would skip the rules above; make it use the caller's rights instead.
alter view if exists v_source_file_feeds set (security_invoker = true);

-- Private storage bucket for uploaded files (no public access; the backend hands out short-lived signed links).
do $$
begin
    insert into storage.buckets (id, name, public) values ('crp-files', 'crp-files', false) on conflict (id) do nothing;
exception when others then
    raise notice 'Could not create the storage bucket automatically (%). Create a private bucket named crp-files in the dashboard.', sqlerrm;
end $$;
