-- Visit results: how many days until the CRP follows up (default 14), and whether the written report was sent to the teacher.
alter table visit_sessions add column if not exists followup_days int not null default 14;
alter table visit_sessions add column if not exists report_sent_at timestamptz;
alter table visit_sessions add column if not exists report_sent_to text;
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'visit_sessions_followup_chk') then
        alter table visit_sessions add constraint visit_sessions_followup_chk check (followup_days between 1 and 365);
    end if;
end $$;
