-- 0064_daily_streak.sql — DAILY STREAK (ardıcıllıq) retention feature.
--
-- A "streak" is the number of CONSECUTIVE CALENDAR DAYS on which the user
-- answered the daily quiz CORRECTLY. Each consecutive correct day pays the
-- normal daily-quiz base reward PLUS, on milestone days, an escalating bonus.
-- Missing a day, or answering wrong (there is one attempt per day, no retry —
-- unique(user_id, claim_date) on daily_quiz_claims), breaks the chain: the
-- next correct day starts the streak again at 1.
--
-- WHY A PERSISTED TABLE, not the read-time scan in lib/coins/quiz.ts
-- getQuizStreak(): the bonus is a COIN-GRANTING decision made at claim time
-- and has to be atomic with the claim itself. Recomputing the streak from the
-- claim history at read time is fine for a display counter, but it cannot pay
-- out a milestone bonus exactly once, inside the same transaction that records
-- the attempt and credits the base reward. So the streak becomes real state,
-- advanced inside the claim transaction, and getStreakStatus() reads it.
-- getQuizStreak() stays as a harmless display fallback and is untouched.
--
-- ABUSE POSTURE (see 0059_security_hardening.sql, CLAUDE.md coin section):
--   * The streak advances STRICTLY ONE DAY per real daily-quiz claim. There is
--     no code path that lets it jump multiple days at once — the branch below
--     only ever does +1, or reset to 1.
--   * Milestone amounts are resolved SERVER-SIDE. The RPC receives the
--     day->bonus map (p_streak_bonuses) from trusted TS code (lib/coins/quiz.ts,
--     from a hardcoded default + optional app_settings override); it never
--     trusts a client-supplied streak length, day, or amount.
--   * The whole thing fails CLOSED: any error aborts the function, so there is
--     never partial credit (base reward without the attempt row, or a milestone
--     bonus without the streak advance).
--   * Accounts are free (email confirmation is off) — but this pays no more per
--     account than the daily quiz already does: one attempt per calendar day,
--     each milestone reachable at most once per unbroken run.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists user_streaks (
  user_id        uuid primary key references profiles(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_claim_date date,
  updated_at     timestamptz not null default now()
);

alter table user_streaks enable row level security;

-- Self-SELECT-only, mirroring daily_quiz_claims_select_own (0042). Reads go
-- through the service-role admin client anyway (getStreakStatus), but a user
-- being able to read their OWN streak directly is harmless and consistent with
-- the rest of the coin surface. No INSERT/UPDATE policy: writes are
-- service-role only, from inside the claim RPC.
create policy user_streaks_select_own
  on user_streaks for select
  to authenticated
  using (user_id = auth.uid());

grant select, insert, update on user_streaks to service_role;

-- ---------------------------------------------------------------------------
-- Companion claim RPC — SUPERSEDES claim_daily_quiz_reward
-- ---------------------------------------------------------------------------
-- Deliberately a NEW function rather than a redefinition of
-- claim_daily_quiz_reward: changing that function's return type (numeric ->
-- jsonb) would be a breaking signature change of a live coin RPC. This one
-- does everything claim_daily_quiz_reward does (insert the attempt row, block
-- the second claim of the day, credit the base reward only when correct) PLUS
-- the streak advance and milestone bonus, all in ONE transaction. The old RPC
-- is kept INTACT as a fallback (lib/coins/quiz.ts calls it when this function
-- is not yet migrated), so it is NOT dropped here.
--
-- New overload, distinct signature (jsonb 4th arg) — no drop needed.
create function claim_daily_quiz_with_streak(
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
begin
  v_credited := case when p_is_correct then p_reward else 0 end;

  -- Record the attempt FIRST, regardless of correctness (reward 0 when wrong),
  -- so a wrong answer can never leave the DB untouched and be retried. Same
  -- unique_violation -> 'already_claimed' contract as claim_daily_quiz_reward.
  begin
    insert into daily_quiz_claims (user_id, claim_date, reward)
    values (p_user_id, current_date, v_credited);
  exception
    when unique_violation then
      raise exception 'already_claimed';
  end;

  insert into user_coins (user_id, balance, daily_limit)
  values (p_user_id, 10, null)
  on conflict (user_id) do nothing;

  -- Streak advance — ONLY on a correct answer. A wrong attempt records its row
  -- above but must not touch the streak at all.
  if p_is_correct then
    select current_streak, longest_streak, last_claim_date
      into v_current_streak, v_longest_streak, v_last_date
      from user_streaks
      where user_id = p_user_id;

    if v_last_date = current_date then
      -- Already advanced today. Guards a direct/duplicate RPC call; the unique
      -- constraint on daily_quiz_claims already blocks the real second claim,
      -- so in practice this branch is defensive. Leave the streak untouched.
      null;
    elsif v_last_date = current_date - 1 then
      -- Yesterday's correct claim — the chain continues.
      v_current_streak := coalesce(v_current_streak, 0) + 1;
    else
      -- Gap (missed >=1 day), or first ever claim (v_last_date is null). The
      -- chain is broken/absent: this correct day starts a fresh streak at 1.
      v_current_streak := 1;
    end if;

    v_longest_streak := greatest(coalesce(v_longest_streak, 0), v_current_streak);

    insert into user_streaks (user_id, current_streak, longest_streak, last_claim_date, updated_at)
    values (p_user_id, v_current_streak, v_longest_streak, current_date, now())
    on conflict (user_id) do update
      set current_streak = excluded.current_streak,
          longest_streak = excluded.longest_streak,
          last_claim_date = excluded.last_claim_date,
          updated_at = excluded.updated_at;

    -- Milestone bonus — resolved SERVER-SIDE from p_streak_bonuses (a
    -- {"day": bonus} map built by trusted TS, never the client). Because the
    -- streak increments by exactly 1 per day and resets on a gap, each
    -- milestone day is reached at most once per unbroken run, so this lookup
    -- credits a given milestone at most once per run — no dedupe guard needed.
    if p_streak_bonuses ? v_current_streak::text then
      v_milestone_bonus := coalesce((p_streak_bonuses ->> v_current_streak::text)::numeric, 0);
      if v_milestone_bonus < 0 then
        v_milestone_bonus := 0;
      end if;
    end if;
  end if;

  -- Single balance write covering base reward + any milestone bonus, so the
  -- returned balance is always the final one. On a wrong answer both are 0.
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

-- House-style grants (0059): the revoke strips service_role's implicit access
-- too, so the explicit re-grant is mandatory.
revoke execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) from public, anon, authenticated;
grant execute on function claim_daily_quiz_with_streak(uuid, numeric, boolean, jsonb) to service_role;

-- app_settings key (documented, NOT seeded — TS-side default in
-- lib/coins/quiz.ts, per the house convention):
--   streak_milestone_bonuses -- default {"3":5,"7":15,"14":30,"30":75}
--     (jsonb map of streak-day -> bonus coins); resolved server-side, the RPC
--     only APPLIES the map it is handed.
