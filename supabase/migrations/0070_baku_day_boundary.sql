-- 0070_baku_day_boundary.sql — move EVERY daily/weekly reset boundary in the
-- coin economy and learning features from UTC to Azerbaijan local time.
--
-- WHY: Asia/Baku is a FIXED UTC+4 offset year-round (Azerbaijan abolished
-- daylight saving in 2016 — there is no spring/autumn shift). Every daily
-- mechanic here previously reset at UTC midnight, which in Baku is 04:00 —
-- wrong and confusing for AZ users, who expect a "daily" thing to roll over at
-- LOCAL midnight. This migration retargets every such boundary to Baku 00:00
-- (= UTC 20:00). The concurrently-built frontend countdowns also target Baku
-- 00:00, so the two agree by construction.
--
-- HOW: every boundary is expressed through the IANA timezone NAME
-- 'Asia/Baku', never a hardcoded "+4" — so the tz database is the single
-- source of truth for the offset and a future tzdata change fixes every call
-- site at once. The TS side mirrors this via
-- Intl.DateTimeFormat(..., { timeZone: 'Asia/Baku' }) in lib/date/baku.ts.
--   * "today's date":         (now() at time zone 'Asia/Baku')::date
--   * "start of today (tstz)": date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
--   * "start of this week":    date_trunc('week', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
--
-- Each function below is a `create or replace` of the CURRENT live definition
-- (grant_daily_energy 0067, settle_tictactoe 0069, claim_wheel_spin 0068,
-- claim_daily_quiz_reward 0059, claim_daily_quiz_with_streak 0064,
-- settle_coin_game 0066, claim_ad_watch_reward 0053, check_and_reserve_coins
-- 0040, weekly_leaderboard 0065, record_lesson_attempt 0060, transfer_coins
-- 0059) with ONLY the day/week boundary changed. Reward amounts, caps, locks,
-- balance math and every other line are byte-for-byte the originals. The
-- house-convention execute grants are reproduced after each function so this
-- file is self-contained and safe to re-run (`create or replace` does not drop
-- grants, but the revoke/grant pattern is restated to match each source file).
--
-- APPLY THIS BY HAND in the Supabase SQL editor, after 0069. It is fully
-- idempotent.


-- ===========================================================================
-- grant_daily_energy (was 0067) — lazy daily energy top-up. v_today drives
-- the once-per-day reset of the energy allowance.
-- ===========================================================================
create or replace function grant_daily_energy(p_user_id uuid, p_daily_grant int)
returns int
language plpgsql
as $$
declare
  v_balance int;
  v_last    date;
  v_today   date := (now() at time zone 'Asia/Baku')::date;
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


-- ===========================================================================
-- settle_tictactoe (was 0069) — v_day_start bounds the daily rewarded-win cap.
-- ===========================================================================
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
    v_day_start := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
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


-- ===========================================================================
-- claim_wheel_spin (was 0068) — the unique(user_id, spin_date) one-spin-per-day
-- guard now keys on the Baku date.
-- ===========================================================================
create or replace function claim_wheel_spin(p_user_id uuid, p_prize numeric, p_max_prize numeric)
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
    values (p_user_id, (now() at time zone 'Asia/Baku')::date, p_prize);
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


-- ===========================================================================
-- claim_daily_quiz_reward (was 0059, 3-arg) — claim_date is the Baku date, so
-- the unique(user_id, claim_date) once-per-day guard rolls at Baku midnight.
-- ===========================================================================
create or replace function claim_daily_quiz_reward(
  p_user_id uuid,
  p_reward numeric,
  p_is_correct boolean
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
  v_credited numeric;
  v_today date := (now() at time zone 'Asia/Baku')::date;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, v_today, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  update user_coins uc
    set balance = uc.balance + v_credited
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function claim_daily_quiz_reward(uuid, numeric, boolean) from public, anon, authenticated;
grant execute on function claim_daily_quiz_reward(uuid, numeric, boolean) to service_role;


-- ===========================================================================
-- claim_daily_quiz_with_streak (was 0064) — claim_date AND the consecutive-day
-- streak arithmetic (last_claim_date = today / today - 1) all key on the Baku
-- date, so a "day" in the streak is a Baku calendar day.
-- ===========================================================================
create or replace function claim_daily_quiz_with_streak(
  p_user_id uuid,
  p_reward numeric,
  p_is_correct boolean,
  p_streak_bonuses jsonb
)
returns jsonb
language plpgsql
as $$
declare
  v_balance         numeric;
  v_credited        numeric;
  v_current_streak  int := 0;
  v_longest_streak  int := 0;
  v_last_date       date;
  v_milestone_bonus numeric := 0;
  v_today           date := (now() at time zone 'Asia/Baku')::date;
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, v_today, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  if p_is_correct then
    select current_streak, longest_streak, last_claim_date
      into v_current_streak, v_longest_streak, v_last_date
      from user_streaks
      where user_id = p_user_id;

    if v_last_date = v_today then
      null;
    elsif v_last_date = v_today - 1 then
      v_current_streak := coalesce(v_current_streak, 0) + 1;
    else
      v_current_streak := 1;
    end if;

    v_longest_streak := greatest(coalesce(v_longest_streak, 0), v_current_streak);

    insert into user_streaks (user_id, current_streak, longest_streak, last_claim_date, updated_at)
    values (p_user_id, v_current_streak, v_longest_streak, v_today, now())
    on conflict (user_id) do update
      set current_streak = excluded.current_streak,
          longest_streak = excluded.longest_streak,
          last_claim_date = excluded.last_claim_date,
          updated_at = excluded.updated_at;

    if p_streak_bonuses ? v_current_streak::text then
      v_milestone_bonus := coalesce((p_streak_bonuses ->> v_current_streak::text)::numeric, 0);
      if v_milestone_bonus < 0 then
        v_milestone_bonus := 0;
      end if;
    end if;
  end if;

  update user_coins uc
    set balance = uc.balance + v_credited + v_milestone_bonus
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return jsonb_build_object(
    'balance', v_balance,
    'current_streak', v_current_streak,
    'longest_streak', v_longest_streak,
    'milestone_bonus', v_milestone_bonus
  );
end;
$$;

revoke execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) from public, anon, authenticated;
grant execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) to service_role;


-- ===========================================================================
-- settle_coin_game (was 0066) — v_day_start bounds the per-user daily play cap.
--
-- NOTE: this RPC is effectively DEAD — the coin-BETTING games (rps, coinflip,
-- wagered XO) it settles were removed in 0067 (XO became the no-wager
-- settle_tictactoe above), and lib/coins/games.ts no longer calls it. It is
-- updated here only for consistency, so no lingering UTC boundary remains in
-- the schema should the function ever be revived.
-- ===========================================================================
create or replace function settle_coin_game(
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
  if p_bet is null or p_bet <= 0 or p_bet <> p_bet_amount then
    raise exception 'invalid_bet';
  end if;

  if p_outcome not in ('win', 'draw', 'loss') then
    raise exception 'invalid_outcome';
  end if;

  if p_payout is null or p_payout < 0 then
    raise exception 'invalid_payout';
  end if;

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

  perform 1 from user_coins where user_id = p_user_id for update;

  v_day_start := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';

  select count(*) into v_count
    from coin_game_plays
    where user_id = p_user_id
      and created_at >= v_day_start;

  if v_count >= p_daily_cap then
    raise exception 'daily_cap_reached';
  end if;

  select balance into v_balance from user_coins where user_id = p_user_id;
  if v_balance < p_bet then
    raise exception 'insufficient_balance';
  end if;

  update user_coins uc
    set balance = uc.balance - p_bet + p_payout
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  insert into coin_game_plays (user_id, game, bet, outcome, payout)
  values (p_user_id, p_game, p_bet, p_outcome, p_payout);

  return v_balance;
end;
$$;

revoke execute on function settle_coin_game(uuid, text, numeric, text, numeric, numeric, jsonb, int) from public, anon, authenticated;
grant execute on function settle_coin_game(uuid, text, numeric, text, numeric, numeric, jsonb, int) to service_role;

grant select, insert, update on user_coins to service_role;


-- ===========================================================================
-- claim_ad_watch_reward (was 0053) — the per-day claim count and the inserted
-- claim_date both key on the Baku date, so the daily cap resets at Baku 00:00.
-- (Both the count comparison and the insert use the same expression so a claim
-- always counts against the same day it is written to.)
-- ===========================================================================
create or replace function claim_ad_watch_reward(
  p_user_id uuid,
  p_reward numeric,
  p_daily_max int
)
returns numeric
language plpgsql
as $$
declare
  v_balance numeric;
  v_count int;
  v_today date := (now() at time zone 'Asia/Baku')::date;
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  perform 1
    from user_coins
    where user_id = p_user_id
    for update;

  select count(*) into v_count
    from ad_watch_claims
    where user_id = p_user_id
      and claim_date = v_today;

  if v_count >= p_daily_max then
    raise exception 'daily_limit_reached';
  end if;

  insert into ad_watch_claims (user_id, claim_date, reward)
  values (p_user_id, v_today, p_reward);

  update user_coins uc
    set balance = uc.balance + p_reward
    where uc.user_id = p_user_id
    returning uc.balance into v_balance;

  return v_balance;
end;
$$;

revoke execute on function claim_ad_watch_reward(uuid, numeric, int) from public, anon, authenticated;
grant execute on function claim_ad_watch_reward(uuid, numeric, int) to service_role;

grant select, insert on ad_watch_claims to service_role;
grant select, insert, update on user_coins to service_role;


-- ===========================================================================
-- check_and_reserve_coins (was 0040) — CONTRACT CHANGE: the daily free
-- allowance previously reset on a ROLLING 24h window (now() - last_reset_at >=
-- 24h). It now resets on a Baku CALENDAR-DAY boundary: the allowance tops up
-- once last_reset_at falls before the start of the current Baku day. The
-- greatest(balance, limit) top-up semantics are unchanged — only the WHEN
-- moves, so it matches lib/date/baku.ts's "next Baku 00:00" countdown exactly.
-- ===========================================================================
create or replace function check_and_reserve_coins(
  p_user_id uuid,
  p_price numeric,
  p_default_daily_limit numeric
)
returns table (
  allowed boolean,
  balance numeric,
  daily_limit numeric
)
language plpgsql
as $$
declare
  v_balance numeric;
  v_daily_limit numeric;
  v_last_reset_at timestamptz;
  v_effective_limit numeric;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
begin
  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  select uc.balance, uc.daily_limit, uc.last_reset_at
    into v_balance, v_daily_limit, v_last_reset_at
    from user_coins uc
    where uc.user_id = p_user_id
    for update;

  v_effective_limit := coalesce(v_daily_limit, p_default_daily_limit);

  if v_last_reset_at < v_day_start then
    v_balance := greatest(v_balance, v_effective_limit);
    v_last_reset_at := now();
    update user_coins
      set balance = v_balance,
          last_reset_at = v_last_reset_at
      where user_id = p_user_id;
  end if;

  return query select (v_balance >= p_price), v_balance, v_daily_limit;
end;
$$;

revoke execute on function check_and_reserve_coins(uuid, numeric, numeric) from public, anon, authenticated;
grant execute on function check_and_reserve_coins(uuid, numeric, numeric) to service_role;


-- ===========================================================================
-- weekly_leaderboard (was 0065) — the current-week window now starts on Baku
-- Monday 00:00 (date_trunc('week', ...) is Monday-based), so the board resets
-- every Monday at Baku midnight instead of Monday UTC midnight.
-- ===========================================================================
create or replace function weekly_leaderboard(p_user_id uuid)
returns table (
  rank         int,
  user_id      uuid,
  display_name text,
  points       bigint,
  is_caller    boolean
)
language sql
security definer
set search_path = public
as $$
  with weekly_points as (
    select
      src.uid,
      sum(src.pts)::bigint as points,
      min(src.ts)          as first_activity
    from (
      select dqc.user_id as uid, 1 as pts, dqc.created_at as ts
        from daily_quiz_claims dqc
        where dqc.reward > 0
          and dqc.created_at >= date_trunc('week', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
      union all
      select uqa.user_id as uid, 1 as pts, uqa.created_at as ts
        from user_quiz_answers uqa
        where uqa.is_correct = true
          and uqa.created_at >= date_trunc('week', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
    ) src
    group by src.uid
  ),
  ranked as (
    select
      rank() over (order by wp.points desc, wp.first_activity asc, wp.uid asc) as rnk,
      wp.uid,
      wp.points
    from weekly_points wp
  ),
  labeled as (
    select
      r.rnk::int as rank,
      r.uid      as user_id,
      coalesce(nullif(trim(p.full_name), ''), 'İstifadəçi') as display_name,
      r.points,
      (r.uid = p_user_id) as is_caller
    from ranked r
    join profiles p on p.id = r.uid
  )
  select l.rank, l.user_id, l.display_name, l.points, l.is_caller
    from labeled l
    where l.rank <= 10
  union
  select l.rank, l.user_id, l.display_name, l.points, l.is_caller
    from labeled l
    where l.user_id = p_user_id
  order by rank asc;
$$;

revoke execute on function weekly_leaderboard(uuid) from public, anon, authenticated;
grant execute on function weekly_leaderboard(uuid) to service_role;


-- ===========================================================================
-- record_lesson_attempt (was 0060) — the one-topic-test-per-day limit now
-- counts attempts since the start of the Baku day. (Not in the original
-- explicit task list, but it is a genuine daily reset boundary the user
-- experiences, so it is retargeted alongside the rest for consistency; the
-- 0060 header itself noted the UTC boundary was a deliberate simplification.)
-- ===========================================================================
create or replace function record_lesson_attempt(
  p_user_id uuid,
  p_topic_id uuid,
  p_score int,
  p_total int,
  p_pass_threshold int
)
returns table (passed boolean, best_score int, attempts int, used_retry boolean)
language plpgsql
as $$
declare
  v_passed boolean;
  v_attempted_today boolean;
  v_used_retry boolean := false;
  v_retries_purchased int;
  v_retries_used int;
begin
  if p_total is null or p_total <= 0 then
    raise exception 'invalid_total';
  end if;
  if p_score is null or p_score < 0 or p_score > p_total then
    raise exception 'invalid_score';
  end if;
  if p_pass_threshold is null or p_pass_threshold <= 0 then
    raise exception 'invalid_threshold';
  end if;

  insert into user_topic_progress (user_id, topic_id)
  values (p_user_id, p_topic_id)
  on conflict (user_id, topic_id) do nothing;

  select utp.retries_purchased, utp.retries_used
    into v_retries_purchased, v_retries_used
    from user_topic_progress utp
    where utp.user_id = p_user_id and utp.topic_id = p_topic_id
    for update;

  select exists (
    select 1
      from lesson_attempts la
      where la.user_id = p_user_id
        and la.topic_id = p_topic_id
        and la.created_at >= date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
  ) into v_attempted_today;

  if v_attempted_today then
    if v_retries_purchased > v_retries_used then
      v_used_retry := true;
    else
      raise exception 'daily_limit_reached';
    end if;
  end if;

  v_passed := p_score >= p_pass_threshold;

  insert into lesson_attempts (user_id, topic_id, score, total, passed)
  values (p_user_id, p_topic_id, p_score, p_total, v_passed);

  update user_topic_progress utp
    set attempts = utp.attempts + 1,
        best_score = greatest(utp.best_score, p_score),
        passed = utp.passed or v_passed,
        passed_at = coalesce(utp.passed_at, case when v_passed then now() end),
        last_attempt_at = now(),
        retries_used = utp.retries_used + case when v_used_retry then 1 else 0 end
    where utp.user_id = p_user_id and utp.topic_id = p_topic_id
    returning utp.passed, utp.best_score, utp.attempts
    into passed, best_score, attempts;

  used_retry := v_used_retry;
  return next;
end;
$$;

revoke execute on function record_lesson_attempt(uuid, uuid, int, int, int) from public, anon, authenticated;
grant execute on function record_lesson_attempt(uuid, uuid, int, int, int) to service_role;


-- ===========================================================================
-- transfer_coins (was 0059, 7-arg) — the per-sender daily transfer cap AND the
-- per-recipient daily receive cap now count transfers since the start of the
-- Baku day, so both caps reset at Baku 00:00. (Also not in the original
-- explicit list, but a daily cap that resets is a daily boundary; retargeted
-- for consistency. The rolling 30-day referral window and the sender
-- min-account-age interval are NOT calendar boundaries and are left untouched.)
-- ===========================================================================
create or replace function transfer_coins(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_amount numeric,
  p_default_daily_limit numeric,
  p_daily_transfer_cap numeric,
  p_min_account_age_days int,
  p_daily_receive_cap numeric
)
returns table (
  sender_balance numeric,
  recipient_balance numeric
)
language plpgsql
as $$
declare
  v_sender_balance numeric;
  v_sender_daily_limit numeric;
  v_recipient_balance numeric;
  v_effective_daily_limit numeric;
  v_transferable numeric;
  v_already_sent_today numeric;
  v_already_received_today numeric;
  v_sender_created_at timestamptz;
  v_sender_balance_after numeric;
  v_recipient_balance_after numeric;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
begin
  if p_sender_id = p_recipient_id then
    raise exception 'sender_equals_recipient';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;

  select p.created_at into v_sender_created_at
    from profiles p where p.id = p_sender_id;

  if v_sender_created_at is null
     or v_sender_created_at > now() - make_interval(days => p_min_account_age_days) then
    raise exception 'sender_account_too_new';
  end if;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_sender_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_recipient_id, p_default_daily_limit, null)
  on conflict (user_id) do nothing;

  if p_sender_id < p_recipient_id then
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
  else
    select uc.balance into v_recipient_balance
      from user_coins uc where uc.user_id = p_recipient_id for update;
    select uc.balance, uc.daily_limit into v_sender_balance, v_sender_daily_limit
      from user_coins uc where uc.user_id = p_sender_id for update;
  end if;

  v_effective_daily_limit := coalesce(v_sender_daily_limit, p_default_daily_limit);
  v_transferable := greatest(0, v_sender_balance - v_effective_daily_limit);

  if p_amount > v_transferable then
    raise exception 'insufficient_transferable_balance';
  end if;

  select coalesce(sum(ct.amount), 0) into v_already_sent_today
    from coin_transfers ct
    where ct.sender_id = p_sender_id
      and ct.created_at >= v_day_start;

  if v_already_sent_today + p_amount > p_daily_transfer_cap then
    raise exception 'daily_transfer_cap_exceeded';
  end if;

  select coalesce(sum(ct.amount), 0) into v_already_received_today
    from coin_transfers ct
    where ct.recipient_id = p_recipient_id
      and ct.created_at >= v_day_start;

  if v_already_received_today + p_amount > p_daily_receive_cap then
    raise exception 'daily_receive_cap_exceeded';
  end if;

  update user_coins uc
    set balance = uc.balance - p_amount
    where uc.user_id = p_sender_id
    returning uc.balance into v_sender_balance_after;

  update user_coins uc
    set balance = uc.balance + p_amount
    where uc.user_id = p_recipient_id
    returning uc.balance into v_recipient_balance_after;

  insert into coin_transfers (sender_id, recipient_id, amount)
  values (p_sender_id, p_recipient_id, p_amount);

  insert into notifications (user_id, message, link)
  values (p_recipient_id, 'Sizə ' || p_amount || ' coin köçürüldü', '/account');

  return query select v_sender_balance_after, v_recipient_balance_after;
end;
$$;

revoke execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric, int, numeric) from public, anon, authenticated;
grant execute on function transfer_coins(uuid, uuid, numeric, numeric, numeric, int, numeric) to service_role;

grant select, insert, update on coin_transfers to service_role;
grant select, insert, update on user_coins to service_role;
grant select, insert, update on notifications to service_role;
grant select on profiles to service_role;
