-- 0089_car_fines.sql — Virtual Qaraj Mərhələ 4: "Rəqəmsal Cərimələr və Bərpa
-- İmtahanı" (digital fines + redemption exam). See
-- docs/VIRTUAL_QARAJ_ROADMAP.md ("Mərhələ 4") for the product framing.
--
-- Scope: a user_garage row can be marked CƏRİMƏLİ (fined) when a topic-test
-- or exam-simulator score falls below a configured threshold. While fined,
-- lib/garage/perks.ts suppresses that tier's perk entirely (server-side, so
-- it is enforced at every consumer for free). Clearing the fine requires
-- passing a short "Cərimə İmtahanı" drawn from the user's own recently-failed
-- topics (lib/garage/fines.ts).
--
-- This feature is a pure status symbol: it grants and costs NO coins, and
-- must never be wired to any coin RPC. Additive-only against Phase 1-3 —
-- purchase_car_tier/car_tiers/user_garage's existing columns are untouched.
--
-- Idempotent: safe to re-run (alter table add column if not exists, create
-- table if not exists, create or replace function, drop+recreate policy).
-- APPLY THIS BY HAND in the Supabase SQL editor, after 0088_sign_speed_correct_flags.sql.

alter table user_garage
  add column if not exists is_fined boolean not null default false,
  add column if not exists fined_at timestamptz,
  add column if not exists fine_reason text;

-- ---------------------------------------------------------------------------
-- redemption_exam_attempts — exists ONLY to rate-limit "Cərimə İmtahanı"
-- draws (try_record_redemption_attempt below). The roadmap doc explicitly
-- calls out the self-fine-then-immediately-clear loop as harmless in coins
-- but a spam/UX risk otherwise (Mərhələ 4, "Sui-istifadə riski") — this table
-- is the anti-spam measure, not an attempt/result history.
-- ---------------------------------------------------------------------------
create table if not exists redemption_exam_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table redemption_exam_attempts enable row level security;

drop policy if exists redemption_exam_attempts_select_own on redemption_exam_attempts;
create policy redemption_exam_attempts_select_own
  on redemption_exam_attempts for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy for anon/authenticated — writes only ever
-- happen inside try_record_redemption_attempt below, via service_role.
create index if not exists redemption_exam_attempts_user_created_idx
  on redemption_exam_attempts (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- apply_car_fine — marks the caller's current car CƏRİMƏLİ. No-op (0 rows
-- touched) if the user has no user_garage row yet: a Piyada-tier user who
-- never purchased a car has nothing to fine or suppress.
-- ---------------------------------------------------------------------------
create or replace function apply_car_fine(
  p_user_id uuid,
  p_reason  text
)
returns void
language plpgsql
as $$
begin
  update user_garage
    set is_fined = true,
        fined_at = now(),
        fine_reason = p_reason
    where user_id = p_user_id;
end;
$$;

revoke execute on function apply_car_fine(uuid, text) from public, anon, authenticated;
grant execute on function apply_car_fine(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- clear_car_fine — clears the fine on the caller's car after a passed
-- redemption exam. No-op if there is no user_garage row or nothing to clear.
-- ---------------------------------------------------------------------------
create or replace function clear_car_fine(
  p_user_id uuid
)
returns void
language plpgsql
as $$
begin
  update user_garage
    set is_fined = false,
        fined_at = null,
        fine_reason = null
    where user_id = p_user_id;
end;
$$;

revoke execute on function clear_car_fine(uuid) from public, anon, authenticated;
grant execute on function clear_car_fine(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- try_record_redemption_attempt — atomic rate limiter for redemption-exam
-- draws. Takes a per-user advisory xact lock first (there is no row to lock
-- for a brand-new user, hence the advisory lock rather than `select ... for
-- update`), then counts this user's attempts in the trailing p_window_seconds
-- window; if the count is already at/over p_limit, returns false WITHOUT
-- inserting (so a rejected draw never itself counts against the limit).
-- Otherwise inserts one row and returns true. The lock is released
-- automatically at transaction end (pg_advisory_XACT_lock).
-- ---------------------------------------------------------------------------
create or replace function try_record_redemption_attempt(
  p_user_id        uuid,
  p_window_seconds int,
  p_limit          int
)
returns boolean
language plpgsql
as $$
declare
  v_count int;
begin
  perform pg_advisory_xact_lock(hashtext('redemption_exam:' || p_user_id::text));

  select count(*) into v_count
    from redemption_exam_attempts
    where user_id = p_user_id
      and created_at >= now() - make_interval(secs => p_window_seconds);

  if v_count >= p_limit then
    return false;
  end if;

  insert into redemption_exam_attempts (user_id) values (p_user_id);
  return true;
end;
$$;

revoke execute on function try_record_redemption_attempt(uuid, int, int) from public, anon, authenticated;
grant execute on function try_record_redemption_attempt(uuid, int, int) to service_role;

grant select, update on user_garage to service_role;
grant select, insert on redemption_exam_attempts to service_role;

-- ---------------------------------------------------------------------------
-- New app_settings tunables (no seed rows — TS-side defaults in
-- lib/garage/fines.ts, read via the readNumericSetting(key, fallback)
-- pattern already used by lib/garage/perks.ts / lib/exam/examSession.ts):
--
--   garage_fine_fail_threshold_pct   default 50   — a topic-test or exam
--     score below this % of correct answers marks the car CƏRİMƏLİ.
--   redemption_exam_daily_limit      default 3    — max redemption-exam
--     DRAW attempts per rolling 24h (try_record_redemption_attempt's
--     p_window_seconds=86400, p_limit=this key).
--   redemption_exam_pass_threshold   default 3    — correct answers needed
--     out of 3 to clear the fine.
-- ---------------------------------------------------------------------------
