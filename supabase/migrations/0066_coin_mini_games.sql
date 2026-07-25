-- 0066_coin_mini_games.sql — COIN MINI-GAMES (Daş-Kağız-Qayçı / XO / Sikkə atma).
--
-- Three coin-BETTING games. In every one the user stakes a fixed bet and the
-- SERVER — never the client — computes the RNG, the outcome, and the payout:
--   * Daş-Kağız-Qayçı (rps):  server picks its throw with crypto RNG.
--   * Sikkə atma (coinflip):  server flips with crypto RNG.
--   * XO / tic-tac-toe:       server RE-SIMULATES the whole game from the
--                             user's submitted move sequence against an
--                             optimal minimax AI, and derives the outcome from
--                             that re-simulation. The AI is unbeatable, so real
--                             outcomes are draw or user-loss; a win is
--                             practically unreachable but honoured if it ever
--                             genuinely occurs.
--
-- ABUSE MODEL (see 0059_security_hardening.sql, CLAUDE.md coin section). Every
-- coin-granting path in this app must hold even against an attacker who can
-- mint unlimited free accounts (email confirmation is off) and who calls the
-- server actions directly (they are plain POST endpoints). The threats here:
--
--   1. Client claims it won when it lost  ->  the client's claimed outcome is
--      IGNORED end to end. lib/coins/games.ts computes the outcome from the
--      server's own RNG / re-simulation and passes THAT down. This RPC does not
--      even receive the client's claim.
--   2. A buggy or hostile settle caller over-credits  ->  this RPC RECOMPUTES
--      the maximum allowed payout from p_bet + p_outcome + the trusted
--      multipliers and REJECTS if p_payout exceeds it. So even if the TS layer
--      were wrong, the DB is the last authority on how many coins leave.
--   3. Grinding the game for coins  ->  a per-user daily cap on the number of
--      plays (counted under a row lock, UTC calendar day), plus the economics:
--      a fair game with a house edge < 1.0 expected multiplier is coin-NEGATIVE
--      on average, so it drains rather than mints coins over volume.
--   4. Betting coins you don't have  ->  balance >= bet is checked under the
--      same row lock that debits, so concurrent plays cannot both pass.
--
-- Everything below happens in ONE transaction and FAILS CLOSED: any error
-- aborts, so there is never a debit without the matching audit row, nor a
-- credit above the recomputed ceiling.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
-- One row per settled play — the audit trail AND the source of truth for the
-- daily-cap count. Repeatable within a day (up to the cap), so — like
-- ad_watch_claims (0053) and UNLIKE daily_quiz_claims — there is deliberately
-- NO unique(user_id, day) constraint; the cap is enforced by a count under
-- lock in the RPC, not by a table constraint.
create table if not exists coin_game_plays (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  game       text not null check (game in ('rps', 'tictactoe', 'coinflip')),
  bet        numeric(10,2) not null check (bet > 0),
  outcome    text not null check (outcome in ('win', 'draw', 'loss')),
  payout     numeric(10,2) not null check (payout >= 0),
  created_at timestamptz not null default now()
);

alter table coin_game_plays enable row level security;

-- Self-SELECT-only, mirroring daily_quiz_claims_select_own (0042) /
-- ad_watch_claims_select_own (0053) / user_streaks_select_own (0064). Reads for
-- the app go through the service-role admin client anyway; a user reading their
-- OWN play history directly is harmless. No INSERT/UPDATE/DELETE policy: all
-- writes go through settle_coin_game below via the service-role client.
create policy coin_game_plays_select_own
  on coin_game_plays for select
  to authenticated
  using (user_id = auth.uid());

-- Covers the daily-cap count (where user_id = ? and created_at >= day_start).
create index coin_game_plays_user_created_at_idx
  on coin_game_plays (user_id, created_at);

grant select, insert on coin_game_plays to service_role;

-- ---------------------------------------------------------------------------
-- settle_coin_game — the single authority that moves coins for a play
-- ---------------------------------------------------------------------------
-- Parameters (all resolved SERVER-SIDE in lib/coins/games.ts; nothing here is
-- ever client-supplied):
--   p_game        one of 'rps' | 'tictactoe' | 'coinflip'
--   p_bet         coins staked for THIS play (must equal p_bet_amount)
--   p_outcome     server-computed 'win' | 'draw' | 'loss'
--   p_payout      server-computed coins to credit back (0 for a loss, the bet
--                 for a draw/push, round(bet*multiplier) for a win)
--   p_bet_amount  the ONLY allowed bet, resolved from app_settings in TS — the
--                 (a) guard: p_bet must equal it, so a tampered settle call
--                 cannot stake an arbitrary amount
--   p_multipliers jsonb {game -> win multiplier}, from trusted TS defaults +
--                 app_settings overrides — used to RECOMPUTE the payout ceiling
--   p_daily_cap   max plays per user per UTC day
--
-- Steps, in order, all-or-nothing:
--   (a) p_bet must equal p_bet_amount (server-resolved bet).
--   (b) recompute the MAX allowed payout for (p_bet, p_outcome, multiplier) and
--       reject if p_payout exceeds it — the over-credit backstop.
--   (c) enforce the daily cap by counting today's (UTC) rows under a row lock.
--   (d) balance >= bet.
--   (e) debit bet, credit payout (net = payout - bet), insert the audit row.
create function settle_coin_game(
  p_user_id     uuid,
  p_game        text,
  p_bet         numeric,
  p_outcome     text,
  p_payout      numeric,
  p_bet_amount  numeric,
  p_multipliers jsonb,
  p_daily_cap   int
)
returns numeric
language plpgsql
as $$
declare
  v_balance      numeric;
  v_count        int;
  v_day_start    timestamptz;
  v_multiplier   numeric;
  v_max_payout   numeric;
begin
  -- (a) The bet is not the client's to choose: it must be exactly the
  -- server-resolved amount. Also rejects a non-positive / null stake.
  if p_bet is null or p_bet <= 0 or p_bet <> p_bet_amount then
    raise exception 'invalid_bet';
  end if;

  if p_outcome not in ('win', 'draw', 'loss') then
    raise exception 'invalid_outcome';
  end if;

  if p_payout is null or p_payout < 0 then
    raise exception 'invalid_payout';
  end if;

  -- (b) Recompute the payout ceiling from scratch. This is the last line of
  -- defense against an over-credit: even a buggy/hostile caller cannot pay out
  -- more than the rules allow, because the DB computes the max itself and only
  -- accepts a payout <= that max.
  --   loss -> 0 (nothing comes back)
  --   draw -> the bet (a push; net 0 — draws are only produced for rps/tictactoe)
  --   win  -> round(bet * multiplier[game]); a missing/invalid multiplier makes
  --           a win impossible (max 0) rather than silently over-paying.
  if p_outcome = 'loss' then
    v_max_payout := 0;
  elsif p_outcome = 'draw' then
    v_max_payout := p_bet;
  else
    v_multiplier := (p_multipliers ->> p_game)::numeric;
    if v_multiplier is null or v_multiplier <= 0 then
      v_max_payout := 0;
    else
      v_max_payout := round(p_bet * v_multiplier);
    end if;
  end if;

  if p_payout > v_max_payout then
    raise exception 'payout_exceeds_max';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  -- Lock the user's coin row BEFORE counting/deciding, mirroring
  -- claim_ad_watch_reward (0053): two concurrent plays serialize here, so they
  -- cannot both read "count < cap" or both spend the same balance.
  perform 1 from user_coins where user_id = p_user_id for update;

  -- (c) Daily cap — count this user's plays since UTC midnight. UTC boundary
  -- (not the session tz) so the cap can't be reset by travelling across a
  -- local-midnight; matches the UTC day used by the TS display counters.
  v_day_start := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  select count(*) into v_count
    from coin_game_plays
    where user_id = p_user_id
      and created_at >= v_day_start;

  if v_count >= p_daily_cap then
    raise exception 'daily_cap_reached';
  end if;

  -- (d) Must be able to afford the stake.
  select balance into v_balance from user_coins where user_id = p_user_id;
  if v_balance < p_bet then
    raise exception 'insufficient_balance';
  end if;

  -- (e) Debit the bet, credit the payout — a single net write so the returned
  -- balance is always final. Then record the audit/cap row. Both inside this
  -- transaction: a debit without its row, or a row without its debit, are both
  -- impossible.
  update user_coins uc
    set balance = uc.balance - p_bet + p_payout
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  insert into coin_game_plays (user_id, game, bet, outcome, payout)
  values (p_user_id, p_game, p_bet, p_outcome, p_payout);

  return v_balance;
end;
$$;

-- Same execute-grant gotcha as every prior coin RPC (0037/0041/0053/0064): the
-- revoke-from-public also strips service_role's own implicit access, so it MUST
-- be re-granted explicitly.
revoke execute on function settle_coin_game(uuid, text, numeric, text, numeric, numeric, jsonb, int) from public, anon, authenticated;
grant execute on function settle_coin_game(uuid, text, numeric, text, numeric, numeric, jsonb, int) to service_role;

-- Re-grant on user_coins is harmless/idempotent, restated for this migration's
-- self-sufficiency (see 0041/0053/0064).
grant select, insert, update on user_coins to service_role;

-- New admin-configurable tunables, same app_settings convention as the rest of
-- the economy — NO seed rows; lib/coins/games.ts hardcodes the TS-side defaults
-- when no row exists yet. Draw is always a push (bet returned, net 0) for rps
-- and tictactoe; coinflip has no draw.
--   game_bet_amount           -- default 1   (coins staked per play, all games)
--   rps_win_multiplier        -- default 1.8 (Daş-Kağız-Qayçı win payout = round(bet*1.8))
--   coinflip_win_multiplier   -- default 1.9 (Sikkə atma win payout = round(bet*1.9))
--   tictactoe_win_multiplier  -- default 5   (XO win payout = round(bet*5); win is
--                                practically unreachable vs the optimal AI)
--   game_daily_play_cap       -- default 30  (max plays per user per UTC day, all games combined)
