-- Row-level security for Supabase only (uses auth.uid()). The runner skips *.supabase.sql on a local server.
-- The FastAPI backend connects with the service role (bypasses RLS) and still authorizes every call; these policies protect
-- direct client access (Supabase JS client, dashboard) so a CRP can only read schools assigned to them.

create or replace function public.my_school_ids() returns setof uuid
language sql stable security definer set search_path = public as $$
    select sa.school_id
    from school_assignments sa
    join crps c on c.id = sa.crp_id
    join app_users u on u.id = c.user_id
    where u.auth_user_id = auth.uid();
$$;

do $$
declare t text;
begin
    foreach t in array array['teachers', 'source_files', 'visits', 'assessments', 'observations', 'interventions', 'follow_ups', 'attendance', 'priority_results']
    loop
        execute format('alter table %I enable row level security', t);
        execute format('drop policy if exists %I on %I', t || '_assigned_read', t);
        execute format('create policy %I on %I for select to authenticated using (school_id in (select public.my_school_ids()))', t || '_assigned_read', t);
    end loop;
end $$;

alter table schools enable row level security;
drop policy if exists schools_assigned_read on schools;
create policy schools_assigned_read on schools for select to authenticated using (id in (select public.my_school_ids()));

-- Tables with no direct client access: RLS on, no policy => only the service role can read or write.
do $$
declare t text;
begin
    foreach t in array array['app_users', 'crps', 'school_assignments', 'priority_categories', 'priority_configurations', 'priority_config_weights', 'priority_runs',
                             'priority_category_scores', 'priority_result_inputs', 'processing_jobs', 'audit_logs']
    loop
        execute format('alter table %I enable row level security', t);
    end loop;
end $$;

-- Storage: create a PRIVATE bucket named crp-files (Dashboard > Storage). No public policies are needed because the backend
-- serves files through short-lived signed URLs.
