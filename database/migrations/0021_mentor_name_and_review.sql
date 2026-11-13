-- Who made a visit. Records belong to the school (visits, observations, results are all kept per school); this only says who was there,
-- so a new mentor sees the whole history of the school and who made each visit.
alter table visit_sessions add column if not exists mentor_name text;
alter table visits add column if not exists mentor_name text;
-- A mentor's check of the AI's verdict on a student answer is kept inside visit_sessions.result
--   (students.per_question[i].mentor = {verdict, reason, by, at}); the AI's own verdict is never overwritten.
