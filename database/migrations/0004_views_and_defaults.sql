-- Convenience view for the school "Data sources" tab, plus the default (uncalibrated) prioritization setup.

-- Which prioritization categories each uploaded file feeds.
create view v_source_file_feeds as
select f.id as source_file_id,
       f.school_id,
       array_remove(array[
           case when exists (select 1 from assessments a where a.source_file_id = f.id and a.validation_status in ('valid', 'conflict')) then 'learning_gap' end,
           case when exists (select 1 from observations o where o.source_file_id = f.id and o.need_code <> 'GOOD_PRACTICE') then 'unresolved_issue' end,
           case when exists (select 1 from observations o where o.source_file_id = f.id and o.need_code <> 'GOOD_PRACTICE') then 'recurring_need' end,
           case when exists (select 1 from interventions i where i.source_file_id = f.id)
                  or exists (select 1 from follow_ups x where x.completion_source_file_id = f.id) then 'overdue_followup' end,
           case when exists (select 1 from visits v where v.source_file_id = f.id) then 'time_since_visit' end,
           case when exists (select 1 from attendance t where t.source_file_id = f.id) then 'attendance' end
       ], null) as feeds
from source_files f;

-- Default categories. Weights and rubrics are illustrative starting points that must be calibrated and approved.
insert into priority_categories (code, name, description, scorer, rule_params, is_builtin, status, proposed_by) values
 ('learning_gap', 'Learning Gap Score', 'Share of assessed students below the agreed benchmark (students below / students assessed x 100).', 'learning_gap',
  '{"benchmark_pct": 40, "aggregation": "students_weighted"}', true, 'approved', 'system'),
 ('unresolved_issue', 'Previous Unresolved Issue Score', 'Seriousness of previously identified issues that remain unresolved.', 'unresolved_issue',
  '{"rubric": {"none": 0, "minor": 30, "significant": 60, "critical": 100}}', true, 'approved', 'system'),
 ('overdue_followup', 'Overdue Follow-up Score', 'How long a verified follow-up deadline has been overdue.', 'overdue_followup',
  '{"tiers": [{"max_days": 0, "score": 0}, {"max_days": 7, "score": 25}, {"max_days": 14, "score": 50}, {"max_days": 30, "score": 75}, {"max_days": null, "score": 100}]}', true, 'approved', 'system'),
 ('time_since_visit', 'Time Since Last Visit Score', 'How overdue a school or teacher is for a visit relative to the expected visit interval.', 'time_since_visit',
  '{"expected_interval_days": 30, "full_score_after_days": 120, "never_visited_from": "joined_date"}', true, 'approved', 'system'),
 ('recurring_need', 'Recurring Support Need Score', 'Whether the same support need appears repeatedly on distinct dated records (duplicates excluded).', 'recurring_need',
  '{"distinct_dates_rubric": {"1": 0, "2": 50, "3": 100}}', true, 'approved', 'system'),
 ('attendance_gap', 'Poor Student Attendance (custom example)', 'Example CRP-added category: score = min(100, (target - actual) / target x 100).', 'attendance_gap',
  '{"target_pct": 90}', false, 'draft', 'crp')
on conflict (code) do nothing;

insert into priority_configurations (version, name, status, notes)
values (1, 'Default illustrative weights v1', 'draft', 'Illustrative weights; not calibrated against real cases. Bands: critical>=80, high>=60, medium>=35.')
on conflict (version) do nothing;

insert into priority_config_weights (config_id, category_id, weight)
select cfg.id, c.id, w.weight
from (values ('learning_gap', 30), ('unresolved_issue', 25), ('overdue_followup', 20), ('time_since_visit', 15), ('recurring_need', 10)) as w (code, weight)
join priority_categories c on c.code = w.code
join priority_configurations cfg on cfg.version = 1
where cfg.status = 'draft'
on conflict (config_id, category_id) do nothing;

select activate_priority_configuration(id) from priority_configurations where version = 1 and status = 'draft';

