-- 0084_vip_plate_market.sql — "Virtual Qaraj" Mərhələ 3: VIP Nömrə Bazarı
-- (VIP license plate market). Full design rationale:
-- docs/VIRTUAL_QARAJ_ROADMAP.md ("Mərhələ 3").
--
-- INDEPENDENT of Phase 1 (0083_virtual_garage.sql, car_tiers/user_garage) and
-- Phase 2 (lib/garage/perks.ts) — a user does not need a car to own a plate.
--
-- CONCEPT: every user gets a free, auto-assigned ordinary plate
-- ("77-BC-432"). A user can additionally spend a large coin amount to buy ONE
-- custom plate ("10-AA-001"). Each plate string can be owned by exactly one
-- user, ever — the `plate_number` primary key IS the lock (first successful
-- insert wins; no auction, no bidding). No transfer/resale in v1.
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, drop+recreate policy). APPLY THIS BY HAND in the Supabase SQL
-- editor, after 0083_virtual_garage.sql.

create table if not exists license_plates (
  plate_number text primary key,
  owner_id     uuid references profiles(id) on delete set null,
  is_custom    boolean not null default false,
  price_paid   numeric not null default 0,
  claimed_at   timestamptz not null default now()
);

alter table license_plates enable row level security;

-- Public SELECT is intentional — showing who owns which plate is the "flex"
-- feature itself; all writes go through the two RPCs below.
drop policy if exists license_plates_select_all on license_plates;
create policy license_plates_select_all on license_plates for select to public using (true);
grant select on license_plates to authenticated, anon;
grant select, insert, delete on license_plates to service_role;

-- A given owner may hold at most one CUSTOM plate at a time (their free plate
-- doesn't count — is_custom = false rows are unbounded per owner because
-- owner_id is not the primary key here, plate_number is).
create unique index if not exists license_plates_one_custom_per_owner
  on license_plates (owner_id) where is_custom = true;

-- ---------------------------------------------------------------------------
-- purchase_custom_plate — standard coin-debit idiom (mirrors purchase_car_tier
-- in 0083 / settle_sign_speed_round in 0071). Debit FIRST, then claim the
-- plate row; both happen in the same transaction, so a plate_taken or
-- already_have_custom_plate failure rolls back the debit too.
-- ---------------------------------------------------------------------------
create or replace function purchase_custom_plate(
  p_user_id      uuid,
  p_plate_number text,
  p_price        numeric
)
returns jsonb
language plpgsql
as $$
declare
  v_balance numeric;
  v_claimed text;
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins
    set balance = balance - p_price
    where user_id = p_user_id
      and balance >= p_price
    returning balance into v_balance;

  if v_balance is null then
    raise exception 'insufficient_coins';
  end if;

  insert into license_plates (plate_number, owner_id, is_custom, price_paid)
  values (p_plate_number, p_user_id, true, p_price)
  on conflict (plate_number) do nothing
  returning plate_number into v_claimed;

  if v_claimed is null then
    raise exception 'plate_taken';
  end if;

  return jsonb_build_object('balance', v_balance, 'plateNumber', p_plate_number);
exception
  -- Raised by license_plates_one_custom_per_owner if p_user_id already owns a
  -- custom plate — a second explicit pre-check would race this same index,
  -- so the index itself is the check, caught here.
  when unique_violation then
    raise exception 'already_have_custom_plate';
end;
$$;

revoke execute on function purchase_custom_plate(uuid, text, numeric) from public, anon, authenticated;
grant execute on function purchase_custom_plate(uuid, text, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- claim_free_plate — no coin logic at all. Does NOT retry internally on
-- collision; the TS caller (lib/garage/plates.ts's ensureFreePlate) retries
-- with a freshly generated random plate.
-- ---------------------------------------------------------------------------
create or replace function claim_free_plate(
  p_user_id      uuid,
  p_plate_number text
)
returns jsonb
language plpgsql
as $$
declare
  v_claimed text;
begin
  insert into license_plates (plate_number, owner_id, is_custom, price_paid)
  values (p_plate_number, p_user_id, false, 0)
  on conflict (plate_number) do nothing
  returning plate_number into v_claimed;

  if v_claimed is null then
    raise exception 'plate_taken';
  end if;

  return jsonb_build_object('plateNumber', p_plate_number);
end;
$$;

revoke execute on function claim_free_plate(uuid, text) from public, anon, authenticated;
grant execute on function claim_free_plate(uuid, text) to service_role;

grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunable (house convention — NO seed row; TS default
-- in lib/garage/plates.ts):
--   vip_plate_price  -- default 2000 (coins to buy ONE custom plate)
