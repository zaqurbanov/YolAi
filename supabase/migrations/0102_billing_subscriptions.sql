-- ===========================================================================
-- 0102 — BILLING SUBSCRIPTIONS: who currently holds which package.
-- ===========================================================================
--
-- 0101 created the CATALOG (what can be bought, at what price). This is the
-- other half: a row per purchase, and the thing that actually changes what a
-- user gets.
--
-- WHY THIS DOES NOT WAIT FOR A PAYMENT PROVIDER — the mistake this migration
-- corrects. Activation was deferred on the grounds that it "depends on the
-- provider". It does not. A subscription is a row saying "this user holds this
-- package until this date"; a payment provider only automates who gets to
-- insert that row. With `source = 'admin'` the owner can grant one by hand
-- TODAY, which makes the whole mechanic testable and shippable before any
-- merchant account exists. When a provider arrives it writes the same row with
-- its own `source` and `provider_subscription_id`, and nothing downstream
-- changes.
--
-- HOW IT CHANGES ANYTHING
--   It doesn't, by itself. lib/coins/dailyGrant.ts resolves the daily coin and
--   energy FLOORS, and an active subscription simply raises them
--   (Math.max against the free floor plus any garage perk — a subscription may
--   never LOWER what a user already gets). That is the entire mechanism: no
--   second balance, no separate wallet, no lump grant. See the 0101 header for
--   why lumps are structurally wrong here.
--
-- EXPIRY IS LAZY, NOT A CRON JOB.
--   `status` is the source of truth and a row is swept to 'expired' on the
--   first read after `expires_at` passes (lib/billing/subscriptions.ts). A
--   partial unique index cannot express "active AND not yet expired" — now() is
--   not immutable, so it cannot appear in an index predicate — and this repo
--   has no scheduler. Lazy expiry follows the same shape as the daily grant,
--   which is also applied on read rather than by a job.
--
--   The sweep is idempotent: two concurrent readers both writing 'expired' is a
--   no-op collision, not a race.
-- ---------------------------------------------------------------------------

create table if not exists billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  -- restrict, not cascade: deleting a package that people hold must fail loudly
  -- rather than silently erasing what they bought. 0101 says archive instead of
  -- delete; this constraint is what enforces it once anything has been sold.
  package_id uuid not null references billing_packages(id) on delete restrict,

  status text not null default 'active' check (status in ('active', 'expired', 'canceled')),

  -- Who created this row. 'admin' is a manual grant (and the only source that
  -- exists today); a payment provider writes its own name here later.
  source text not null default 'admin',
  provider_subscription_id text,

  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  canceled_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_subscriptions enable row level security;

-- A user may read their OWN subscription — the /qiymetler page shows "your plan
-- is active until X". No insert/update/delete policy for anon or authenticated:
-- every write goes through an admin server action or (later) a verified payment
-- callback, both service-role. Same posture as user_course_unlocks (0060).
drop policy if exists billing_subscriptions_select_own on billing_subscriptions;
create policy billing_subscriptions_select_own
  on billing_subscriptions for select
  to authenticated
  using (user_id = auth.uid());

-- AT MOST ONE ACTIVE SUBSCRIPTION PER USER. This is the real guard against
-- double-granting: a second grant while one is live loses the insert rather
-- than silently stacking two floors, and the granting code must expire the old
-- row first (which it does). Partial index, so expired/canceled history is
-- unlimited and preserved.
create unique index if not exists billing_subscriptions_one_active_per_user
  on billing_subscriptions (user_id)
  where status = 'active';

-- The hot read: "does this user have an active subscription", on every balance
-- read. Covered by the unique index above for the point lookup; this one serves
-- the history view (newest first) on the admin/user screens.
create index if not exists billing_subscriptions_user_created_idx
  on billing_subscriptions (user_id, created_at desc);

grant select, insert, update, delete on billing_subscriptions to service_role;
