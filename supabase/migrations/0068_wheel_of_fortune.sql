-- 0068_wheel_of_fortune.sql — ÇARX (daily free prize wheel).
--
-- One FREE spin per user per UTC day. A spin lands on one of a fixed set of coin
-- prizes and credits it. No wager, no paid spins — it is a daily reward, the
-- same shape as the daily quiz (0042): unique(user_id, spin_date) is the
-- one-per-day guard, and the prize is resolved SERVER-SIDE (weighted RNG in
-- lib/coins/wheel.ts) and re-bounded here.
--
-- ABUSE MODEL (CLAUDE.md coin section): a free daily prize is, like the daily
-- quiz, a bounded per-account payout — one spin/day, prize capped by the segment
-- set. Even with unlimited free accounts each nets at most one modest prize per
-- calendar day. The client NEVER supplies the prize; the RPC additionally
-- rejects a prize above the server-passed ceiling (p_max_prize) so a tampered
-- caller cannot over-credit. Fail-closed.

create table if not exists wheel_spins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  spin_date  date not null,
  prize      numeric(10,2) not null check (prize >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, spin_date)
);

alter table wheel_spins enable row level security;

create policy wheel_spins_select_own
  on wheel_spins for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert on wheel_spins to service_role;

-- claim_wheel_spin: insert-then-credit in one transaction, fail-closed. The
-- unique(user_id, spin_date) constraint is the real one-per-day guard; a second
-- same-day call hits unique_violation, caught and re-raised as 'already_spun'.
-- p_prize is server-resolved; p_max_prize is the largest configured segment, so
-- the DB is the final authority on how many coins a spin can pay.
create function claim_wheel_spin(p_user_id uuid, p_prize numeric, p_max_prize numeric)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
begin
  if p_prize is null or p_prize < 0 then
    raise exception 'invalid_prize';
  end if;
  if p_max_prize is null or p_prize > p_max_prize then
    raise exception 'prize_exceeds_max';
  end if;

  begin
    insert into wheel_spins (user_id, spin_date, prize)
    values (p_user_id, current_date, p_prize);
  exception
    when unique_violation then
      raise exception 'already_spun';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + p_prize
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function claim_wheel_spin(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function claim_wheel_spin(uuid, numeric, numeric) to service_role;

grant select, insert, update on user_coins to service_role;

-- app_settings tunable (house convention — NO seed row; TS default in
-- lib/coins/wheel.ts):
--   wheel_prizes -- default [1,2,3,5,2,1,3,10] (jsonb array of coin prizes, one
--                   per wheel segment; the server picks a segment uniformly at
--                   random with crypto RNG and credits that segment's value).
