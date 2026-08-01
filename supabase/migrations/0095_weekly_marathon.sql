-- ===========================================================================
-- 0095 — HEFTƏLIK MARAFON (Weekly Marathon): the daily chest becomes a
-- week-aware 7-slot reward schedule.
-- ===========================================================================
--
-- WHAT CHANGES
--   The daily chest (0081_daily_quests.sql) paid a single energy amount
--   (`daily_chest_reward`) every Baku day. From this migration on, the chest
--   reward is a 7-slot WEEKLY schedule (`weekly_marathon_rewards`, a jsonb
--   array in app_settings — Monday..Sunday). Days 1-6 pay ENERGY (varied
--   amounts), day 7 (the week end) pays COINS. The schedule is resolved
--   SERVER-SIDE only: lib/coins/weeklyMarathon.ts reads the key, validates it
--   all-or-nothing (exactly 7 entries, type ∈ {'energy','coins'}, amount a
--   finite number > 0), and falls back to a TS-side default on any error.
--   Reward amount + type are never client-supplied.
--
--   `claim_daily_chest` gains a 4th argument, `p_reward_type text default
--   'energy'`, so the OLD 3-arg RPC calls still resolve (default = energy =
--   today's behavior). Postgres cannot drop an argument via create-or-replace,
--   so the 3-arg signature is dropped explicitly first, then the new one is
--   created. The only TS caller is lib/coins/dailyQuests.ts's claimDailyChest,
--   which this change set updates to pass p_reward_type — verified by a repo
--   grep (no other caller reaches this RPC).
--
-- WHY THIS DOES NOT BREACH THE ENERGY→COIN INVARIANT
--   The invariant (0094_two_currency_economy.sql) forbids energy being
--   convertible BACK into coins. A chest COIN reward is a coin INCOME path —
--   quest-gated (3 daily missions), 1 claim per user per Baku day via
--   daily_quest_claims.chest_claimed, amount resolved server-side — it never
--   spends energy to mint coins. The COINS branch below writes only
--   user_coins; it never writes user_energy. The ENERGY branch keeps writing
--   only user_energy (via credit_energy), exactly as before. No function here
--   converts energy into coins.
--
-- ONE CLAIM PER BAKU DAY — UNCHANGED
--   The `update daily_quest_claims set chest_claimed = true ...` step runs for
--   BOTH branches inside the same transaction as the credit, so a failure rolls
--   back the credit and the chest_claimed flag together. The row-lock + flag
--   guard (the 0085 definition, carried through 0094) is untouched.
--
-- LOCK ORDER
--   The repo-wide lock order is user_energy first, then user_coins
--   (apply_daily_grant / credit_energy). The COINS branch of this function
--   locks user_coins ONLY and never writes user_energy, so it cannot deadlock
--   against the energy path. The ENERGY branch delegates to credit_energy
--   (user_energy only). Neither branch locks both tables, so there is no
--   lock-order violation.
--
-- NOT SEEDED, NOT DELETED
--   `weekly_marathon_rewards` is deliberately NOT seeded here — its TS-side
--   default lives in lib/coins/weeklyMarathon.ts (established convention:
--   new app_settings keys get a TS default, not a seeded row). The old
--   `daily_chest_reward` key and its row are left in place for the legacy
--   admin endpoint (GET/PATCH `?type=daily-chest-reward`), which is kept for
--   backward compatibility and is no longer read by the claim path.
-- ===========================================================================

drop function if exists claim_daily_chest(uuid, text[], numeric);

create or replace function claim_daily_chest(
  p_user_id      uuid,
  p_mission_keys text[],
  p_reward       numeric,
  p_reward_type  text default 'energy'
)
returns jsonb
language plpgsql
as $$
declare
  v_day_start       timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_today           date := (now() at time zone 'Asia/Baku')::date;
  v_chat_count      int;
  v_chest_claimed   boolean;
  v_sign_speed_done boolean;
  v_lesson_done     boolean;
  v_xo_done         boolean;
  v_wheel_done      boolean;
  v_daily_quiz_done boolean;
  v_energy          int;
  v_balance         numeric;
  v_key             text;
  v_key_done        boolean;
begin
  insert into daily_quest_claims (user_id, quest_date)
  values (p_user_id, v_today)
  on conflict (user_id, quest_date) do nothing;

  select chat_message_count, chest_claimed
    into v_chat_count, v_chest_claimed
    from daily_quest_claims
    where user_id = p_user_id and quest_date = v_today
    for update;

  if v_chest_claimed then
    raise exception 'already_claimed';
  end if;

  select exists (
    select 1 from sign_speed_sessions
    where user_id = p_user_id and used = true and issued_at >= v_day_start
  ) into v_sign_speed_done;

  select exists (
    select 1 from lesson_attempts
    where user_id = p_user_id and created_at >= v_day_start
  ) into v_lesson_done;

  select exists (
    select 1 from coin_game_plays
    where user_id = p_user_id and game = 'tictactoe' and created_at >= v_day_start
  ) into v_xo_done;

  select exists (
    select 1 from wheel_spins
    where user_id = p_user_id and spin_date = v_today
  ) into v_wheel_done;

  select exists (
    select 1 from daily_quiz_claims
    where user_id = p_user_id and claim_date = v_today
  ) into v_daily_quiz_done;

  foreach v_key in array p_mission_keys loop
    v_key_done := case v_key
      when 'chat_1' then v_chat_count >= 1
      when 'chat_2' then v_chat_count >= 2
      when 'chat_3' then v_chat_count >= 3
      when 'sign_speed' then v_sign_speed_done
      when 'lesson' then v_lesson_done
      when 'xo' then v_xo_done
      when 'wheel' then v_wheel_done
      when 'daily_quiz' then v_daily_quiz_done
      else false
    end;

    if not coalesce(v_key_done, false) then
      raise exception 'quests_incomplete';
    end if;
  end loop;

  if p_reward_type = 'coins' then
    -- Coin income path. Mirror apply_daily_grant's insert-on-missing + for
    -- update pattern (0094 lines ~371-388). LOCK ORDER: this branch never
    -- writes user_energy, only user_coins, so no lock-order violation.
    insert into user_coins (user_id, balance, daily_limit)
    values (p_user_id, 0, null)
    on conflict (user_id) do nothing;

    select uc.balance into v_balance
      from user_coins uc
      where uc.user_id = p_user_id
      for update;
    v_balance := coalesce(v_balance, 0) + round(p_reward);
    update user_coins uc set balance = v_balance where uc.user_id = p_user_id;

    v_energy := coalesce((select ue.balance from user_energy ue where ue.user_id = p_user_id), 0);
  else
    -- ENERGY path — behaves exactly as today (credit_energy).
    v_energy := credit_energy(p_user_id, p_reward);
    v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);
  end if;

  update daily_quest_claims
    set chest_claimed = true,
        chest_claimed_at = now(),
        updated_at = now()
    where user_id = p_user_id and quest_date = v_today;

  return jsonb_build_object('balance', v_balance, 'energy', v_energy, 'reward', round(p_reward), 'reward_type', p_reward_type);
end;
$$;

revoke execute on function claim_daily_chest(uuid, text[], numeric, text) from public, anon, authenticated;
grant execute on function claim_daily_chest(uuid, text[], numeric, text) to service_role;
