-- Phase 3b: web push notifications. Stores one row per browser
-- subscription (a user can have several — multiple devices/browsers).
-- keys.p256dh/keys.auth from the PushSubscriptionJSON are stored as plain
-- text columns rather than jsonb — simpler to query/delete-by-endpoint than
-- reaching into a nested jsonb shape, and there are only two fields.
--
-- RLS posture: same self-scoped shape as conversations/messages
-- (0002_rls_policies.sql) — a user can select/insert/delete only their own
-- rows via auth.uid() = user_id. Unlike notifications/referrals (writes
-- funneled through service-role only), this table IS written directly by
-- the owning user's RLS-respecting client (subscribing/unsubscribing is a
-- self-service action, not something requiring a mint/credit guard), so
-- INSERT/DELETE policies are granted here, not withheld.
--
-- No admin-read policy is added on purpose: the admin fan-out send action
-- (app/admin/users/pushActions.ts) reads across all users' subscriptions,
-- which requires bypassing RLS entirely — it uses the service-role client
-- (lib/supabase/admin.ts) instead, following the getAdminUsers.ts/
-- getRegisteredDriverCount.ts precedent for admin-wide reads.
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on push_subscriptions
  for select using (auth.uid() = user_id);

create policy "push_subscriptions_insert_own" on push_subscriptions
  for insert with check (auth.uid() = user_id);

create policy "push_subscriptions_delete_own" on push_subscriptions
  for delete using (auth.uid() = user_id);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

grant select, insert, delete on push_subscriptions to service_role;
