-- ===========================================================================
-- 0101 — BILLING PACKAGES: an admin-editable catalog of what can be bought.
-- ===========================================================================
--
-- WHY A TABLE AND NOT app_settings KEYS
--   Every economy number in this app is an app_settings key with a TS default,
--   and that is right for SINGLE tunables (one price, one cap). A catalog is a
--   different shape: an arbitrary number of rows, each with its own price and
--   its own bundle of grants, created and retired over time. `car_tiers`
--   (0083) is the existing precedent for exactly this — a priced catalog in a
--   table, editable by the admin — and this follows it.
--
--   The driving requirement is the owner's: prices must be changeable without a
--   deploy, because they will have to move with inflation. A hardcoded 7 AZN in
--   TypeScript is a code change, a redeploy and a migration of nothing; a row
--   is a form field.
--
-- WHAT A PACKAGE IS
--   Two kinds, deliberately in ONE table because they share everything that
--   matters (price, provider mapping, lifecycle, ordering) and differ only in
--   what they grant:
--
--   'subscription' — recurring access for `period_days`. Grants DAILY FLOORS,
--       never a lump: apply_daily_grant (0094) tops a balance UP TO a floor and
--       does nothing when the balance is already above it, so a monthly lump
--       would suppress the user's own daily grant for the rest of the month and
--       leave a subscriber worse off than a free user. Floors compose with that
--       mechanic instead of fighting it. `user_coins.daily_limit` is already
--       read as a per-user coin floor by apply_daily_grant, which is why the
--       coin side needs no new plumbing at activation time.
--
--   'one_time'     — a single purchase granting a lump of coins and/or energy.
--       Not used by the first release (the subscription is the product), but
--       the column set is here so adding coin packs later is a row, not a
--       migration.
--
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
--   No purchase, no activation, no payment provider. Those need the provider
--   contract that does not exist yet (see the payments discussion: no VÖEN, so
--   the merchant account is still open). `provider` / `provider_price_id` are
--   the seam they will attach to. Creating the catalog first is not premature:
--   it is the half that is provider-independent, and it is the half the owner
--   asked for.
--
-- THE OLD PLACEHOLDERS. 0001 created subscription_plans / user_subscriptions
-- "schema only, not wired up". They are NOT reused: their shape encodes a
-- credits model this economy does not have (monthly_credit_limit,
-- credits_remaining) and prices as `price_cents int`, which cannot carry the
-- two-currency floors or an AZN decimal price. They stay in place, empty and
-- inert, rather than being dropped in the same change that introduces their
-- replacement — dropping them is a separate, deliberate cleanup once billing
-- is actually live.
-- ---------------------------------------------------------------------------

create table if not exists billing_packages (
  id uuid primary key default gen_random_uuid(),

  -- Stable identifier for analytics and for mapping to the provider's own
  -- product. Renaming the display `name` must not break either, hence a
  -- separate immutable-by-convention slug.
  code text not null unique,
  name text not null,
  description text,

  kind text not null check (kind in ('subscription', 'one_time')),

  -- The admin's number. numeric(10,2) rather than integer minor units: the
  -- owner edits this in AZN in a form, and every other money-ish column in this
  -- schema (unlock_price, car_tiers.coin_price) is numeric already.
  price numeric(10,2) not null check (price >= 0),
  currency text not null default 'AZN',

  -- Subscription only. 30 = a month; kept as days so a weekly or annual plan is
  -- a row rather than a schema change.
  period_days int check (period_days is null or period_days > 0),

  -- SUBSCRIPTION GRANTS — daily floors, see the header.
  coin_daily_floor numeric(10,2) check (coin_daily_floor is null or coin_daily_floor >= 0),
  energy_daily_floor int check (energy_daily_floor is null or energy_daily_floor >= 0),

  -- ONE-TIME GRANTS — lump amounts.
  coin_amount numeric(10,2) check (coin_amount is null or coin_amount >= 0),
  energy_amount int check (energy_amount is null or energy_amount >= 0),

  -- Non-economic perks. Deliberately narrow: perks that remove a SINK (e.g.
  -- "all courses unlocked") are not modelled, because they hand the user
  -- something they could already afford while destroying one of the few places
  -- energy is spent. Cosmetic and ad perks cost the economy nothing.
  ads_disabled boolean not null default false,
  badge_label text,

  -- Payment provider seam. Null until a provider is contracted; a package can
  -- exist and be priced before it is sellable.
  provider text,
  provider_price_id text,

  -- draft = editable but never shown to users; active = purchasable;
  -- archived = hidden but preserved, so an existing subscriber's package row
  -- still resolves. NEVER delete a package that has been sold — archive it.
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sort_order int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Shape enforcement, so a half-filled row cannot reach the purchase path:
  --   a subscription needs a period and at least one thing it grants;
  --   a one-time purchase needs at least one lump.
  constraint billing_packages_subscription_shape check (
    kind <> 'subscription'
    or (
      period_days is not null
      and (coalesce(coin_daily_floor, 0) > 0 or coalesce(energy_daily_floor, 0) > 0)
    )
  ),
  constraint billing_packages_one_time_shape check (
    kind <> 'one_time'
    or (coalesce(coin_amount, 0) > 0 or coalesce(energy_amount, 0) > 0)
  )
);

alter table billing_packages enable row level security;

-- Users may read ACTIVE packages only: the pricing UI needs name/price/grants,
-- and a draft is by definition not for sale. Draft/archived rows are invisible
-- to everyone but the service role, so an unfinished price can never be shown.
drop policy if exists billing_packages_select_active on billing_packages;
create policy billing_packages_select_active
  on billing_packages for select
  to authenticated
  using (status = 'active');

-- No insert/update/delete policy for anon or authenticated, by design: every
-- write goes through the admin server actions, which run requireAdmin() first
-- and then use the service-role client. Same posture as quiz_questions (0051)
-- and lesson_courses (0060).

-- The pricing page reads "active packages in display order", one query.
create index if not exists billing_packages_status_order_idx
  on billing_packages (status, sort_order);

grant select, insert, update, delete on billing_packages to service_role;

-- ---------------------------------------------------------------------------
-- NO SEED ROWS.
--
-- House convention is that economy numbers are never seeded (lib/* holds the
-- TS-side defaults and settings readers fail open to them). A catalog has no
-- sensible default row — the whole point is that the owner sets the price — so
-- the table ships empty and /admin/paketler is where the first package is
-- created. An empty catalog renders an empty pricing list, never an error.
--
-- The numbers agreed for the first package, for reference when creating it:
--   code 'pro-monthly', kind 'subscription', price 7.00 AZN, period_days 30,
--   coin_daily_floor 15, energy_daily_floor 20, ads_disabled true.
-- Free users sit at daily_coin_grant = 3 and game_daily_energy = 10, so those
-- floors are 5x and 2x the free experience respectively.
-- ---------------------------------------------------------------------------
