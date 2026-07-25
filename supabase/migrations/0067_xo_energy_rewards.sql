-- 0067_xo_energy_rewards.sql — XO (tic-tac-toe) reworked to a NO-WAGER model
-- with an ENERGY daily allowance and a capped win reward.
--
-- The betting mini-games (Daş-Kağız-Qayçı, Sikkə atma) were removed for legal
-- reasons: staking coins on chance reads as gambling. XO stays, but is now
-- REWARD-based, not wagered:
--   * Playing costs 1 ENERGY, never coins. Energy is a per-user daily allowance
--     (default 10), topped up to the grant each UTC day (no carry-over).
--   * WINNING credits a small coin reward (default 2), but only for the first
--     N rewarded wins per day (default 3) — the daily win-reward CAP. Draw/loss
--     pay nothing. The play is always recorded (energy is spent regardless).
--
-- ABUSE MODEL (CLAUDE.md coin section): energy grants no coins and the win
-- reward is doubly bounded — energy caps plays at 10/day, and the reward cap
-- limits paid wins to N/day — so even with unlimited free accounts and the
-- "first game of the day is easy to win" mechanic (games.ts), an account nets at
-- most cap*reward coins/day (default 3*2 = 6), over real calendar days. Grants
-- and rewards are resolved SERVER-SIDE; the client supplies only its board
-- moves, which the server re-simulates. Everything below is one transaction,
-- fail-closed.

-- ---------------------------------------------------------------------------
-- Energy table + lazy daily grant
-- ---------------------------------------------------------------------------
create table if not exists user_energy (
  user_id         uuid primary key references profiles(id) on delete cascade,
  balance         int not null default 0 check (balance >= 0),
  last_grant_date date,
  updated_at      timestamptz not null default now()
);

alter table user_energy enable row level security;

create policy user_energy_select_own
  on user_energy for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update on user_energy to service_role;

-- Lazy daily top-up: on the first call of a new UTC day the balance is RESET to
-- p_daily_grant (unused energy does not carry over). Idempotent within a day, so
-- it cannot be spammed to refill. Called both on the read path (energy meter)
-- and inside settle_tictactoe. p_daily_grant is server-resolved, never client.
create or replace function grant_daily_energy(p_user_id uuid, p_daily_grant int)
returns int
language plpgsql
as $$
declare
  v_balance int;
  v_last    date;
  v_today   date := (now() at time zone 'utc')::date;
begin
  insert into user_energy (user_id, balance, last_grant_date)
  values (p_user_id, p_daily_grant, v_today)
  on conflict (user_id) do nothing;

  select balance, last_grant_date into v_balance, v_last
    from user_energy
    where user_id = p_user_id
    for update;

  if v_last is null or v_last < v_today then
    update user_energy
      set balance = p_daily_grant,
          last_grant_date = v_today,
          updated_at = now()
      where user_id = p_user_id
      returning balance into v_balance;
  end if;

  return v_balance;
end;
$$;

revoke execute on function grant_daily_energy(uuid, int) from public, anon, authenticated;
grant execute on function grant_daily_energy(uuid, int) to service_role;

-- ---------------------------------------------------------------------------
-- coin_game_plays: allow bet = 0 (a no-wager XO play stakes nothing)
-- ---------------------------------------------------------------------------
-- 0066 created the ledger with check (bet > 0) for the betting games. A
-- no-wager XO play has bet 0, so relax to (bet >= 0). Existing rows are
-- unaffected.
alter table coin_game_plays drop constraint if exists coin_game_plays_bet_check;
alter table coin_game_plays add constraint coin_game_plays_bet_check check (bet >= 0);

-- ---------------------------------------------------------------------------
-- settle_tictactoe — no-wager: spend energy, conditionally reward a win
-- ---------------------------------------------------------------------------
-- Parameters all resolved SERVER-SIDE in lib/coins/games.ts:
--   p_outcome                'win' | 'draw' | 'loss' (from server re-simulation)
--   p_win_reward             coins credited on a REWARDED win (0 for draw/loss)
--   p_daily_energy_grant     the energy allowance (for the lazy grant)
--   p_energy_cost            energy consumed per play (default 1)
--   p_daily_win_reward_cap   max REWARDED wins per user per UTC day
--
-- Order (one transaction, fail-closed):
--   1. lazy energy grant, then spend energy — a no-energy play aborts here and
--      costs nothing (raises 'no_energy').
--   2. on a win under the daily cap, credit p_win_reward; otherwise reward 0.
--   3. record the play (bet 0, payout = credited reward).
create function settle_tictactoe(
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

  -- (1) Grant (lazily) and spend energy BEFORE anything else.
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

  -- (2) Reward a win only while under the daily rewarded-win cap. The cap counts
  -- today's tictactoe wins that actually paid out (payout > 0), so uncapped
  -- (reward 0) wins do not consume a cap slot.
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

  -- (3) Record the play (bet 0 — no wager; payout = the reward actually paid).
  insert into coin_game_plays (user_id, game, bet, outcome, payout)
  values (p_user_id, 'tictactoe', 0, p_outcome, v_reward);

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', v_reward);
end;
$$;

revoke execute on function settle_tictactoe(uuid, text, numeric, int, int, int) from public, anon, authenticated;
grant execute on function settle_tictactoe(uuid, text, numeric, int, int, int) to service_role;

grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunables (house convention — NO seed rows; TS defaults
-- in lib/coins/games.ts):
--   game_daily_energy          -- default 10 (energy granted/reset per user per UTC day)
--   game_energy_cost           -- default 1  (energy per XO play)
--   tictactoe_win_reward       -- default 2  (coins per rewarded XO win)
--   tictactoe_daily_win_cap    -- default 3  (max rewarded XO wins per user per UTC day)
