-- User -> admin Q&A ("Sual-cavab" feature). A user submits a free-text
-- question; an admin answers it later. Modeled on 0041/0042's RLS posture:
-- self-select-only, no INSERT/UPDATE policy for authenticated/anon — all
-- writes (submit + answer) go through the service-role client
-- (lib/admin/questions.ts), never a direct client-side insert/update.
create table admin_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  question text not null,
  answer text,
  answered_at timestamptz,
  answered_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

alter table admin_questions enable row level security;

create policy admin_questions_select_own
  on admin_questions for select
  to authenticated
  using (user_id = auth.uid());

-- Supports the user's own "my questions, newest first" query.
create index admin_questions_user_created_at_idx
  on admin_questions (user_id, created_at desc);

-- Supports the admin list's "unanswered first, then newest first" ordering
-- (order by answered_at is null desc, created_at desc) — a plain btree on
-- answered_at serves that ordering fine at this table's expected volume, no
-- need for a partial/expression index.
create index admin_questions_answered_at_idx
  on admin_questions (answered_at);

grant select, insert, update on admin_questions to service_role;
