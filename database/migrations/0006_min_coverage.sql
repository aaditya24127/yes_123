-- A school/teacher is ranked only when at least 40% of the active weight is backed by evidence; below that it is listed as "insufficient evidence".
alter table priority_configurations alter column min_coverage_for_ranking set default 40;
update priority_configurations set min_coverage_for_ranking = 40 where min_coverage_for_ranking = 60;
