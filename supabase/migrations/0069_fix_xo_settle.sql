-- 0069_fix_xo_settle.sql — COMPLETES 0067 when it applied only partially.
--
-- On at least one database, 0067 stopped after creating user_energy +
-- grant_daily_energy but BEFORE the coin_game_plays bet-constraint relaxation
-- and the settle_tictactoe function (confirmed: a bet=0 insert still violated
-- coin_game_plays_bet_check, and settle_tictactoe was PGRST202 "not found").
-- Re-running 0067 whole is not safe (its `create policy` would error as the
-- policy already exists), so this migration re-applies ONLY the tail, and every
-- statement here is idempotent so it is safe to run even on a DB where 0067 DID
-- fully apply.
--
-- Run this once in the Supabase SQL editor (after 0067/0068).

-- (1) Relax the bet constraint so a no-wager XO play (bet 0) can be recorded.
--     drop-if-exists + add is idempotent.
alter table coin_game_plays drop constraint if exists coin_game_plays_bet_check;
alter table coin_game_plays add constraint coin_game_plays_bet_check check (bet >= 0);

-- (2) The settle function (create OR REPLACE — safe whether or not it exists).
--     Spends energy, conditionally rewards a capped win, records the play; one
--     transaction, fail-closed. See 0067 for the full rationale.
create or replace function settle_tictactoe(
  p_user_id              uuid,
  p_outcome              text,
  p_win_reward           numeric,
  p_daily_energy_grant   int,
  p_energy_cost          int,
  p_daily_win_reward_cap int
)
returns jsonb
language plpgsql
as $$
declare
  v_energy      int;
  v_balance     numeric;
  v_day_start   timestamptz;
  v_win_count   int;
  v_reward      numeric := 0;
begin
  if p_outcome not in ('win', 'draw', 'loss') then
    raise exception 'invalid_outcome';
  end if;
  if p_energy_cost is null or p_energy_cost <= 0 then
    raise exception 'invalid_energy_cost';
  end if;

  perform grant_daily_energy(p_user_id, p_daily_energy_grant);

  update user_energy
    set balance = balance - p_energy_cost,
        updated_at = now()
    where user_id = p_user_id
      and balance >= p_energy_cost
    returning balance into v_energy;

  if v_energy is null then
    raise exception 'no_energy';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  perform 1 from user_coins where user_id = p_user_id for update;

  if p_outcome = 'win' and p_win_reward > 0 and p_daily_win_reward_cap > 0 then
    v_day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    select count(*) into v_win_count
      from coin_game_plays
      where user_id = p_user_id
        and game = 'tictactoe'
        and outcome = 'win'
        and payout > 0
        and created_at >= v_day_start;

    if v_win_count < p_daily_win_reward_cap then
      v_reward := p_win_reward;
    end if;
  end if;

  update user_coins uc
    set balance = uc.balance + v_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  insert into coin_game_plays (user_id, game, bet, outcome, payout)
  values (p_user_id, 'tictactoe', 0, p_outcome, v_reward);

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', v_reward);
end;
$$;

revoke execute on function settle_tictactoe(uuid, text, numeric, int, int, int) from public, anon, authenticated;
grant execute on function settle_tictactoe(uuid, text, numeric, int, int, int) to service_role;

grant select, insert, update on user_coins to service_role;
grant select, insert on coin_game_plays to service_role;
