-- Numbered tasks inside one request ("Task 1: send marks, Task 2: send attendance ..."), each with its own files, status and review.
-- A request is the package the CRP sends; its items are what the teacher answers one by one. The CRP accepts or rejects each item
-- (a rejection needs remarks) and, on accepting, can add the files to the records (assessments, attendance, school numbers ...).
create table if not exists task_items (
    id            uuid primary key default gen_random_uuid(),
    request_id    uuid not null references teacher_requests (id) on delete cascade,
    position      int not null,
    title         text not null,
    instructions  text,
    kind          text not null default 'other',
    status        text not null default 'open' constraint task_items_status_chk check (status in ('open', 'submitted', 'accepted', 'rejected')),
    response_text text,                       -- the teacher's note with the last submission
    review_remark text,                       -- why the CRP rejected it (required when rejecting)
    added_to      text,                       -- the records section the files were added to on accepting, if any
    submitted_at  timestamptz,
    reviewed_at   timestamptz,
    created_at    timestamptz not null default now()
);
create index if not exists task_items_request_idx on task_items (request_id, position);

-- Which task item a teacher's upload belongs to.
alter table upload_batches add column if not exists task_item_id uuid references task_items (id);
create index if not exists upload_batches_task_item_idx on upload_batches (task_item_id);

-- Existing single requests become a package with one item, so everything works the same way from now on (visit notices have no items).
insert into task_items (request_id, position, title, instructions, kind, status, response_text, submitted_at, created_at)
select r.id, 1, r.title, r.message, r.kind,
       case r.status when 'submitted' then 'submitted' when 'accepted' then 'accepted' else 'open' end,
       r.response_text, r.responded_at, r.created_at
from teacher_requests r
where r.kind <> 'visit_notice' and r.status <> 'cancelled' and not exists (select 1 from task_items i where i.request_id = r.id);

update upload_batches b set task_item_id = i.id
from teacher_requests r join task_items i on i.request_id = r.id
where r.batch_id = b.id and b.task_item_id is null;
