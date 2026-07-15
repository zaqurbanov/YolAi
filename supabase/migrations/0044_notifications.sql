-- Generic per-user notifications feed (coin-transfer received, admin
-- answered your question, etc). Same RLS posture as admin_questions/
-- coin_transfers: self-select-only, no INSERT/UPDATE policy for
-- authenticated/anon — all writes (creating a notification, marking it
-- read) go through the service-role client (lib/notifications/notifications.ts).
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  message text not null,
  link text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table notifications enable row level security;

create policy notifications_select_own
  on notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Serves both "unread count" and "recent notifications" reads: filter on
-- user_id (+ read for the count), ordered by created_at desc.
create index notifications_user_unread_idx
  on notifications (user_id, read, created_at desc);

grant select, insert, update on notifications to service_role;
