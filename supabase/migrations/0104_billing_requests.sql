-- ===========================================================================
-- 0104 — BILLING REQUESTS: "I want this plan, call me."
-- ===========================================================================
--
-- WHY. /qiymetler shows real, priced plans but has no purchase path — no
-- payment provider is contracted yet (no VÖEN, see the payments discussion), so
-- the paid card ended in a dead "Onlayn ödəniş tezliklə" label. A visitor ready
-- to pay had nowhere to go, which is the worst possible moment to lose someone.
-- This table is the interim path: they leave an email and a phone number, the
-- admin contacts them and grants the subscription by hand
-- (billing_subscriptions, 0102).
--
-- It stays useful after a provider is wired up — bank transfer, corporate
-- billing and support cases all need a "contact me" lane.
--
-- ANONYMOUS SUBMISSIONS ARE ALLOWED, DELIBERATELY. `user_id` is nullable
-- because /qiymetler is a public page and the people most likely to submit are
-- exactly the ones who have not signed up yet. Requiring an account first would
-- defeat the purpose of the form.
--
-- WHAT PROTECTS IT, given that a server action is a plain POST endpoint any
-- client can call:
--   * the partial unique index below — one OPEN request per (package, email),
--     so the same address cannot pile up rows;
--   * a honeypot field and format validation in lib/billing/requests.ts;
--   * `package_id` is validated server-side against ACTIVE packages only, so a
--     request can never reference a draft or an arbitrary uuid.
--
-- HONEST LIMIT: none of that stops a determined bot rotating email addresses,
-- because this repo still has no per-IP limiter anywhere (CLAUDE.md lists it as
-- open). The blast radius is rows in an admin-only table — annoying, not
-- dangerous, and deletable. Revisit if it is ever actually abused.
--
-- RLS: service-role only, no policies for anon or authenticated. Users never
-- read this table; they write through a server action that uses the
-- service-role client. Contact details of other people are exactly the kind of
-- data that must not be readable from PostgREST.
-- ---------------------------------------------------------------------------

create table if not exists billing_requests (
  id uuid primary key default gen_random_uuid(),

  -- restrict, not cascade: a package with open requests against it must not be
  -- deletable out from under them. 0101 already says archive instead of delete.
  package_id uuid not null references billing_packages(id) on delete restrict,

  -- Nullable and `on delete set null`: an anonymous visitor has no profile row,
  -- and deleting an account later must not erase the record that they asked.
  user_id uuid references profiles(id) on delete set null,

  email text not null,
  -- Stored normalised (digits, with a leading + when given) by the TS layer, so
  -- the admin sees one format rather than five.
  phone text not null,
  note text,

  status text not null default 'new'
    check (status in ('new', 'contacted', 'done', 'rejected')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table billing_requests enable row level security;

-- No policies at all — service-role only. This is intentional and is the whole
-- access model for the table; see the RLS note in the header.

-- One OPEN request per email per package. Partial, so the same person can ask
-- again after a previous request has been handled (status moved off 'new'),
-- and so history is never blocked. lower() makes it case-insensitive, matching
-- how the TS layer normalises the address before insert.
create unique index if not exists billing_requests_one_open_per_email
  on billing_requests (package_id, lower(email))
  where status = 'new';

-- The admin list is "newest first", optionally filtered by status.
create index if not exists billing_requests_status_created_idx
  on billing_requests (status, created_at desc);

grant select, insert, update, delete on billing_requests to service_role;
