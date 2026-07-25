-- 0065_weekly_leaderboard.sql — WEEKLY LEADERBOARD (həftəlik reytinq).
--
-- Retention feature #3. READ-ONLY: this migration awards NO coins and adds NO
-- coin-granting path. It only RANKS activity that other, already-hardened RPCs
-- recorded (0042 daily quiz, 0051/0059 lesson quiz). Nothing here writes to
-- user_coins, daily_quiz_claims or user_quiz_answers.
--
-- METRIC (fixed): a user's weekly points = the number of CORRECT quiz answers
-- they made in the CURRENT ISO week (Monday-start), summed across two sources:
--   1. daily_quiz_claims where reward > 0  — a correct daily quiz. A wrong
--      daily answer writes a reward = 0 row (0059), so `reward > 0` is exactly
--      "answered correctly". 1 point per row (once/day via unique(user_id,
--      claim_date)).
--   2. user_quiz_answers where is_correct = true — a correct lesson-quiz
--      answer. 1 point per row (once/question EVER via unique(user_id,
--      question_id); is_correct added in 0059).
--
-- WHY created_at AND NOT claim_date for the weekly window: both tables carry a
-- `created_at timestamptz default now()`, but daily_quiz_claims ALSO has a
-- `claim_date date`. Using created_at on BOTH sources means one uniform
-- timestamptz boundary — `date_trunc('week', now())` — for the union, instead
-- of mixing a date and a timestamptz. date_trunc('week', ...) in Postgres
-- starts the week on MONDAY, so the board RESETS every Monday 00:00 (server
-- time) automatically: no cron, no stored reset row, no cleanup job. Last
-- week's rows simply fall outside the filter.
--
-- ABUSE POSTURE: nothing new to guard. The metric is abuse-resistant BY
-- CONSTRUCTION via the existing unique constraints above (each daily quiz
-- counts once/day, each lesson question once ever). This function neither reads
-- nor writes any balance. Even with unlimited free accounts (email confirmation
-- is off — see CLAUDE.md), the worst case is a throwaway account appearing in a
-- purely cosmetic ranking; it earns nothing.
--
-- PRIVACY: the function exposes ONLY {rank, user_id, display_name, points,
-- is_caller}. user_id is returned so the UI can highlight the caller's own row
-- ("sən") among the top rows; display_name is profiles.full_name with a SQL
-- fallback. NO email, NO other profile column is ever selected here. SECURITY
-- DEFINER so the ranking can read every user's profile/answer rows across RLS
-- (it is called via the service-role admin client from a server component).

-- ---------------------------------------------------------------------------
-- RPC — one call returns the top 10 AND the caller's own true rank
-- ---------------------------------------------------------------------------
-- Takes p_user_id so the caller's row can be included EVEN WHEN their rank is
-- outside the top 10 (so the UI can render "sən: #42"). The caller's rank is
-- their TRUE global rank across ALL users with points this week — it is
-- computed by ranking the full weekly_points set first, THEN slicing, so it is
-- never confined to the top-10 window.
--
-- CORRECTNESS: a user may have BOTH daily-quiz and lesson-quiz points in the
-- same week. The UNION ALL feeds both sources into ONE per-user aggregate
-- (sum grouped by user_id) BEFORE ranking, so those points sum into a single
-- total rather than producing two separate leaderboard rows.
--
-- TIEBREAK / rank(): rank() (competition ranking — ties share a rank, the next
-- rank skips) rather than dense_rank(), because the ordering carries a
-- deterministic tiebreak — points desc, then earliest activity this week, then
-- user_id (unique). With user_id in the ORDER BY there are NO true ties, so
-- ranks come out as a stable, gapless 1,2,3,… sequence and a shown "#42" is
-- meaningful and reproducible across calls.
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
          and dqc.created_at >= date_trunc('week', now())
      union all
      select uqa.user_id as uid, 1 as pts, uqa.created_at as ts
        from user_quiz_answers uqa
        where uqa.is_correct = true
          and uqa.created_at >= date_trunc('week', now())
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
  -- Top 10 UNION the caller's own row. UNION (not UNION ALL) dedupes the
  -- caller when they are already inside the top 10, so their row appears once.
  select l.rank, l.user_id, l.display_name, l.points, l.is_caller
    from labeled l
    where l.rank <= 10
  union
  select l.rank, l.user_id, l.display_name, l.points, l.is_caller
    from labeled l
    where l.user_id = p_user_id
  order by rank asc;
$$;

-- House-style grants (0059/0064): the revoke strips service_role's implicit
-- access too, so the explicit re-grant is mandatory. Called via the
-- service-role admin client (lib/coins/leaderboard.ts), never directly by a
-- user session.
revoke execute on function weekly_leaderboard(uuid) from public, anon, authenticated;
grant execute on function weekly_leaderboard(uuid) to service_role;
