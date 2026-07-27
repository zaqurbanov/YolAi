-- 0083_virtual_garage.sql — "Virtual Qaraj" (virtual garage), Phase 1 ONLY:
-- car ownership + display. No perks, no plate market, no fines, no tuning, no
-- monthly inspection — see docs/VIRTUAL_QARAJ_ROADMAP.md ("Mərhələ 1") for the
-- full roadmap; do not build ahead of it here.
--
-- car_tiers is a small FIXED catalog (5 rows). Unlike every other economy
-- knob in this app, tier price is NOT an app_settings key-value tunable —
-- it's per-row, editable only via the admin API's `?type=car-tiers` PATCH
-- (app/api/admin/chat-meta/route.ts), never by the RPC's caller directly.
--
-- Idempotent: safe to re-run (create table if not exists, seed via
-- on-conflict-do-nothing, create or replace function, drop+recreate policy).
-- APPLY THIS BY HAND in the Supabase SQL editor, after 0082_exam_simulator.sql.

create table if not exists car_tiers (
  id uuid primary key default gen_random_uuid(),
  tier_order int not null unique,
  name text not null,
  emoji text not null,
  coin_price numeric not null check (coin_price >= 0),
  created_at timestamptz not null default now()
);

insert into car_tiers (tier_order, name, emoji, coin_price) values
  (0, 'Piyada', '🚶', 0),
  (1, 'Lada 2107', '🚗', 150),
  (2, 'Toyota Prius', '🚙', 500),
  (3, 'BMW', '🚘', 1500),
  (4, 'Mercedes G-Class', '🏎️', 5000)
on conflict (tier_order) do nothing;

alter table car_tiers enable row level security;
drop policy if exists car_tiers_select_all on car_tiers;
create policy car_tiers_select_all on car_tiers for select to public using (true);
grant select on car_tiers to authenticated, anon;
-- Writes only via service-role (admin API route) — no insert/update/delete
-- policy for anon/authenticated.
grant select, update on car_tiers to service_role;

create table if not exists user_garage (
  user_id uuid primary key references profiles(id) on delete cascade,
  tier_id uuid not null references car_tiers(id),
  purchased_at timestamptz not null default now()
);
alter table user_garage enable row level security;
drop policy if exists user_garage_select_own on user_garage;
create policy user_garage_select_own on user_garage for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policy — those only ever happen via the
-- service-role RPC below (purchase_car_tier).
grant select, insert, update on user_garage to service_role;

-- ---------------------------------------------------------------------------
-- purchase_car_tier — reads the REAL price from car_tiers by id (never trusts
-- a client-supplied price), debits coins using the standard coin-debit idiom
-- (see 0071_sign_speed_game.sql), then upserts user_garage. tier_order = 0
-- (Piyada, free) skips the coin table entirely — it's a no-cost downgrade.
-- ---------------------------------------------------------------------------
create or replace function purchase_car_tier(
  p_user_id  uuid,
  p_tier_id  uuid
)
returns jsonb
language plpgsql
as $$
declare
  v_coin_price numeric;
  v_tier_name  text;
  v_balance    numeric;
begin
  select coin_price, name into v_coin_price, v_tier_name
    from car_tiers
    where id = p_tier_id;

  if not found then
    raise exception 'tier_not_found';
  end if;

  -- Always ensure a user_coins row exists first, so a balance can be read
  -- below regardless of which branch (free vs. paid) runs.
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  if v_coin_price = 0 then
    select balance into v_balance
      from user_coins
      where user_id = p_user_id;
  else
    update user_coins
      set balance = balance - v_coin_price
      where user_id = p_user_id
        and balance >= v_coin_price
      returning balance into v_balance;

    if v_balance is null then
      raise exception 'insufficient_coins';
    end if;
  end if;

  insert into user_garage (user_id, tier_id)
  values (p_user_id, p_tier_id)
  on conflict (user_id) do update set tier_id = excluded.tier_id, purchased_at = now();

  return jsonb_build_object('balance', v_balance, 'tierId', p_tier_id, 'tierName', v_tier_name);
end;
$$;

-- Same execute-grant gotcha as every prior coin RPC in this repo: the revoke
-- from public also strips service_role's own implicit access, so it MUST be
-- re-granted explicitly.
revoke execute on function purchase_car_tier(uuid, uuid) from public, anon, authenticated;
grant execute on function purchase_car_tier(uuid, uuid) to service_role;

grant select, insert, update on user_coins to service_role;
