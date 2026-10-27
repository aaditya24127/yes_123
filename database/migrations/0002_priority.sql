-- Prioritization configuration, versioned weights, and reproducible results with evidence links.

create table priority_categories (
    id                 uuid primary key default gen_random_uuid(),
    code               text not null unique,
    name               text not null,
    description        text,
    scorer             text not null,                      -- key of the deterministic Python scorer for this category
    rule_params        jsonb not null default '{}'::jsonb, -- rubric / tiers / formula parameters, approved by the CRP
    is_builtin         boolean not null default false,
    status             text not null default 'draft' constraint priority_categories_status_chk check (status in ('draft', 'approved', 'disabled')),
    proposed_by        text not null default 'crp' constraint priority_categories_proposed_chk check (proposed_by in ('system', 'llm', 'crp')),
    approved_by_crp_id uuid references crps (id),
    approved_at        timestamptz,
    created_at         timestamptz not null default now()
);

create table priority_configurations (
    id                           uuid primary key default gen_random_uuid(),
    version                      integer not null unique,
    name                         text not null,
    status                       text not null default 'draft' constraint priority_configurations_status_chk check (status in ('draft', 'active', 'archived')),
    band_thresholds              jsonb not null default '{"critical": 80, "high": 60, "medium": 35}'::jsonb,
    missing_data_policy          text not null default 'provisional_normalized' constraint priority_configurations_missing_chk
                                     check (missing_data_policy in ('provisional_normalized', 'flag_only')),
    min_coverage_for_ranking     numeric(5, 2) not null default 60,
    expected_visit_interval_days integer not null default 30,
    notes                        text,
    created_by_crp_id            uuid references crps (id),
    approved_at                  timestamptz,
    created_at                   timestamptz not null default now()
);
create unique index priority_one_active_config on priority_configurations ((true)) where status = 'active';

create table priority_config_weights (
    config_id       uuid not null references priority_configurations (id) on delete cascade,
    category_id     uuid not null references priority_categories (id),
    weight          numeric(5, 2) not null constraint priority_weight_nonneg_chk check (weight >= 0 and weight <= 100),
    params_override jsonb,
    primary key (config_id, category_id)
);

-- Weights of a configuration can only change while it is a draft (history must stay explainable).
create function priority_weights_guard() returns trigger language plpgsql as $$
declare cfg uuid; st text;
begin
    cfg := coalesce(new.config_id, old.config_id);
    select status into st from priority_configurations where id = cfg;
    if st is not null and st <> 'draft' then
        raise exception 'configuration % is % and its weights are frozen; create a new version', cfg, st;
    end if;
    return coalesce(new, old);
end $$;
create trigger priority_weights_guard_trg before insert or update or delete on priority_config_weights
    for each row execute function priority_weights_guard();

-- Activates a draft configuration after checking weights total 100 and categories are approved.
create function activate_priority_configuration(p_config uuid) returns void language plpgsql as $$
declare total numeric; unapproved int;
begin
    select coalesce(sum(weight), 0) into total from priority_config_weights where config_id = p_config;
    if round(total, 2) <> 100 then
        raise exception 'weights total % (must be exactly 100)', total;
    end if;
    select count(*) into unapproved from priority_config_weights w join priority_categories c on c.id = w.category_id
        where w.config_id = p_config and c.status <> 'approved' and w.weight > 0;
    if unapproved > 0 then
        raise exception '% weighted categories are not approved', unapproved;
    end if;
    update priority_configurations set status = 'archived' where status = 'active' and id <> p_config;
    update priority_configurations set status = 'active', approved_at = now() where id = p_config;
end $$;

-- One run = one ranking of all eligible schools/teachers at an as_of date under one configuration.
create table priority_runs (
    id          uuid primary key default gen_random_uuid(),
    config_id   uuid not null references priority_configurations (id),
    as_of_date  date not null,
    entity_type text not null constraint priority_runs_entity_chk check (entity_type in ('school', 'teacher')),
    created_by_crp_id uuid references crps (id),
    created_at  timestamptz not null default now(),
    notes       text
);

create table priority_results (
    id             uuid primary key default gen_random_uuid(),
    run_id         uuid not null references priority_runs (id) on delete cascade,
    entity_type    text not null,
    school_id      uuid not null references schools (id),
    teacher_id     uuid references teachers (id),
    overall_score  numeric(6, 2),
    band           text constraint priority_results_band_chk check (band in ('critical', 'high', 'medium', 'low')),
    rank           integer,
    data_coverage  numeric(5, 2),           -- % of active weight backed by verified evidence
    is_provisional boolean not null default false,
    needs_review   boolean not null default false,
    flags          jsonb not null default '[]'::jsonb,   -- e.g. never_observed, conflicting_records
    alerts         jsonb not null default '[]'::jsonb    -- mandatory deadline alerts shown outside the weighted score
);
create index priority_results_run_idx on priority_results (run_id, rank);
create index priority_results_school_idx on priority_results (school_id);

create table priority_category_scores (
    id                    uuid primary key default gen_random_uuid(),
    result_id             uuid not null references priority_results (id) on delete cascade,
    category_id           uuid not null references priority_categories (id),
    score                 numeric(6, 2),
    status                text not null constraint priority_cat_scores_status_chk check (status in ('verified', 'unknown', 'provisional', 'review')),
    weight                numeric(5, 2) not null,
    weighted_contribution numeric(6, 2),
    explanation           text,
    details               jsonb not null default '{}'::jsonb
);
create index priority_cat_scores_result_idx on priority_category_scores (result_id);

-- Which exact records (and files) produced each category score: powers the "Data sources" view.
create table priority_result_inputs (
    id                 uuid primary key default gen_random_uuid(),
    category_score_id  uuid not null references priority_category_scores (id) on delete cascade,
    record_type        text not null constraint priority_inputs_type_chk check (record_type in ('assessment', 'observation', 'follow_up', 'visit', 'attendance')),
    record_id          uuid not null,
    source_file_id     uuid references source_files (id)
);
create index priority_inputs_score_idx on priority_result_inputs (category_score_id);
create index priority_inputs_file_idx on priority_result_inputs (source_file_id);
