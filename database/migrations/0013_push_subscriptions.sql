-- Web Push: one row per browser / phone a teacher has allowed alerts on. The endpoint is a private address at the browser vendor's
-- push service; p256dh and auth are the keys that encrypt the message for that device only.
create table if not exists push_subscriptions (
    id          uuid primary key default gen_random_uuid(),
    teacher_id  uuid not null references teachers (id),
    endpoint    text not null unique,
    p256dh      text not null,
    auth        text not null,
    user_agent  text,
    failures    int not null default 0,
    created_at  timestamptz not null default now(),
    last_ok     timestamptz
);
create index if not exists push_subscriptions_teacher_idx on push_subscriptions (teacher_id);
