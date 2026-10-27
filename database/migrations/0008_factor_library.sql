-- The factor library: 25 ready-made factors in 4 groups. Only the original 5 carry weight by default (the ranking does not
-- change until a CRP switches more on in the priority panel). All are approved so they can be switched on straight away.

update priority_categories set group_name = 'Learning', sort_order = 10, data_hint = 'Test results' where code = 'learning_gap';
update priority_categories set group_name = 'Issues and follow-up', sort_order = 20, data_hint = 'Visit reports / observations' where code = 'unresolved_issue';
update priority_categories set group_name = 'Issues and follow-up', sort_order = 21, data_hint = 'Agreed actions and deadlines' where code = 'overdue_followup';
update priority_categories set group_name = 'Visits and contact', sort_order = 30, data_hint = 'Visit logs' where code = 'time_since_visit';
update priority_categories set group_name = 'Issues and follow-up', sort_order = 35, data_hint = 'Visit reports / observations' where code = 'recurring_need';

update priority_categories set name = 'Poor student attendance', group_name = 'Students and school', sort_order = 40, entity_scope = 'school',
       status = 'approved', is_builtin = true, proposed_by = 'system', data_hint = 'Monthly attendance',
       description = 'How far the latest monthly attendance is below the target (20 points below = full score).',
       rule_params = '{"full_score_gap_pts": 20}'
 where code = 'attendance_gap';

insert into priority_categories (code, name, description, scorer, rule_params, is_builtin, status, proposed_by, entity_scope, group_name, sort_order, data_hint) values
 ('learning_trend', 'Learning getting worse', 'Change in the share of students below the benchmark between the last two tests of the same class and subject.',
  'learning_trend', '{"full_score_at_pts": 15}', true, 'approved', 'system', 'both', 'Learning', 11, 'Two or more tests'),
 ('foundational_gap', 'Foundational learning gap (Classes 1-3)', 'Learning gap only in Classes 1-3, where reading and number basics are built (NIPUN Bharat focus).',
  'foundational_gap', '{"max_class": 3, "full_score_at_gap_pct": 60}', true, 'approved', 'system', 'both', 'Learning', 12, 'Test results for Classes 1-3'),
 ('language_gap', 'Language and reading gap', 'Learning gap in language subjects and reading skills.',
  'language_gap', '{"full_score_at_gap_pct": 60}', true, 'approved', 'system', 'both', 'Learning', 13, 'Test results'),
 ('maths_gap', 'Mathematics gap', 'Learning gap in Mathematics.',
  'maths_gap', '{"full_score_at_gap_pct": 60}', true, 'approved', 'system', 'both', 'Learning', 14, 'Test results'),
 ('low_class_average', 'Low average marks', 'Average marks across classes (65% or more = no concern, 35% or less = full score).',
  'low_class_average', '{"good_avg_pct": 65, "poor_avg_pct": 35}', true, 'approved', 'system', 'both', 'Learning', 15, 'Test results with class averages'),
 ('test_participation', 'Students missing tests', 'Share of students on the roll who did not take the latest tests (25% missing = full score).',
  'test_participation', '{"full_score_at_missed_pct": 25}', true, 'approved', 'system', 'both', 'Learning', 16, 'Test results with roll numbers'),
 ('hotspot_class', 'One very weak class', 'The single weakest class and subject, even when the school average looks fine.',
  'hotspot_class', '{"ok_gap_pct": 25, "full_score_at_gap_pct": 70}', true, 'approved', 'system', 'both', 'Learning', 17, 'Test results'),
 ('critical_open_issues', 'Serious issues open', 'How many significant or critical issues are still open (critical counts double).',
  'critical_open_issues', '{}', true, 'approved', 'system', 'both', 'Issues and follow-up', 23, 'Visit reports / observations'),
 ('issue_age', 'Issues left unsolved for long', 'Days since the oldest still-open issue was first noted (30 days = fine, 180 days = full score).',
  'issue_age', '{"ok_days": 30, "full_score_days": 180}', true, 'approved', 'system', 'both', 'Issues and follow-up', 24, 'Visit reports / observations'),
 ('actions_not_completed', 'Agreed actions not done', 'Share of agreed actions that are past their planned date or were not done.',
  'actions_not_completed', '{}', true, 'approved', 'system', 'both', 'Issues and follow-up', 25, 'Action plans / intervention registers'),
 ('visit_frequency', 'Too few recent visits', 'Visits in the last 90 days compared with the expected visit interval.',
  'visit_frequency', '{"window_days": 90}', true, 'approved', 'system', 'both', 'Visits and contact', 31, 'Visit logs'),
 ('teachers_unobserved', 'Teachers never observed', 'Share of the school''s teachers who have never had a classroom observation.',
  'teachers_unobserved', '{}', true, 'approved', 'system', 'school', 'Visits and contact', 32, 'Teacher list + visit logs'),
 ('new_teacher_support', 'New teachers', 'Teachers who joined in the last year usually need more support.',
  'new_teacher_support', '{"new_for_days": 365}', true, 'approved', 'system', 'both', 'Visits and contact', 33, 'Teacher joining dates'),
 ('data_freshness', 'Old or missing information', 'How old the newest record is (45 days = fine, 180 days = full score). A visit refreshes the picture.',
  'data_freshness', '{"ok_days": 45, "full_score_days": 180}', true, 'approved', 'system', 'both', 'Visits and contact', 34, 'Any dated record'),
 ('attendance_trend', 'Attendance falling', 'Drop in attendance between the last two months (10 points = full score).',
  'attendance_trend', '{"full_score_drop_pts": 10}', true, 'approved', 'system', 'school', 'Students and school', 41, 'Monthly attendance'),
 ('pupil_teacher_ratio', 'Too many students per teacher', 'Students per teacher compared with the RTE norm of 30 (50 or more = full score).',
  'pupil_teacher_ratio', '{"norm": 30, "full_score_at": 50}', true, 'approved', 'system', 'school', 'Students and school', 42, 'Teacher list + enrolment or class rolls'),
 ('teaching_load', 'Multi-grade teaching', 'Teachers handling two or more primary classes together.',
  'teaching_load', '{}', true, 'approved', 'system', 'both', 'Students and school', 43, 'Classes each teacher teaches'),
 ('girls_enrolled', 'Number of girls', 'More girls enrolled = higher priority (300 or more = full score). Needs the girls enrolment figure.',
  'fact_rule', '{"fact_key": "girls_enrolled", "label": "Girls enrolled", "unit": "girls", "mode": "higher", "low": 0, "high": 300}',
  true, 'approved', 'system', 'school', 'Students and school', 44, 'Girls enrolled (type in or upload)'),
 ('special_needs_support', 'Children with special needs', 'More children with special needs (CWSN) = higher priority (15 or more = full score).',
  'fact_rule', '{"fact_key": "cwsn_enrolled", "label": "Children with special needs", "unit": "children", "mode": "higher", "low": 0, "high": 15}',
  true, 'approved', 'system', 'school', 'Students and school', 45, 'CWSN count (type in or upload)')
on conflict (code) do nothing;
