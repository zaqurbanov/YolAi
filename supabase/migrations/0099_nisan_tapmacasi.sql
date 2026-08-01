-- 0099_nisan_tapmacasi.sql — "Nişan Tapmacası" (road sign riddle), the fourth
-- retention mini-game alongside XO (0067), the wheel (0068) and Nişan Sürəti
-- (0071). 100% architectural mirror of 0071_sign_speed_game.sql.
--
-- SHAPE: one round = 10 questions. Each question is a BLURRED photo of a road
-- sign, a hand-written "İpucu" hint, and a 2x2 grid of four TEXT option labels
-- ("Maksimum sürətin məhdudlaşdırılması", "Giriş qadağandır", ...). The player
-- identifies which sign the blurred photo shows using the hint.
--
-- WHY THE OPTIONS ARE TEXT LABELS, NOT SIGN IMAGES: showing the unblurred sign
-- as an option would turn the game into trivial visual shape-matching — the
-- answer would be the image that looks like the photo, the hint would become
-- pointless, and the correct option would be given away by the very picture
-- meant to be the question. The option labels are short official sign names
-- (drawn from the static NISAN_TAPMACASI_LABELS distractor list plus the
-- curated question's own label), so the player must actually reason from the
-- blurred shape + hint. The sign images that DO reach the client are only the
-- blurred question photos, never the unblurred options.
--
-- The server picks the question set + correct answers at round-start and
-- stores them server-side in `nisan_tapmacasi_sessions`; the client only ever
-- sees { code, hint, imageUrl, options } — never the correct index. Grading
-- happens in settle_nisan_tapmacasi_round against the stored answers, never
-- trusting a client-reported score.
--
-- ENERGY DESIGN DECISION (read before touching this file) — identical to 0071:
-- energy is spent INSIDE start_nisan_tapmacasi_round, atomically with
-- inserting the session row, NOT inside settle_nisan_tapmacasi_round. If
-- energy were instead spent at settle time, a user could start a round, let it
-- go stale (never submit, or wait past the TTL), and start another round for
-- free — the round-start is the resource that must be metered, since that is
-- the action that reveals 10 real questions and consumes server-picked
-- content. A `no_energy` failure inside start_nisan_tapmacasi_round means NO
-- session row is created at all, so there is nothing left over to later expire
-- or replay.
--
-- This reuses the ONE shared `user_energy` table / `grant_daily_energy`
-- function from 0067 — there is a single energy pool for "the games section"
-- as a whole (XO, Nişan Sürəti and this game draw from the same daily
-- allowance). No second energy table or function is created here.
--
-- CURRENCY (0094 two-currency invariant): the per-correct reward pays ENERGY
-- via credit_energy, exactly like the 0094 version of settle_sign_speed_round
-- that this file copies. NO function in this file ever writes user_coins —
-- the coin balance is read only via the unlocked
--   coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0)
-- for the shared meter. Energy can never be converted back into coins.
--
-- REWARD CAP DESIGN DECISION — same as 0071: the per-correct-answer reward is
-- CLAMPED, not rejected, once the daily cap is reached — a user near the cap
-- should still get partial credit for whatever room is left, not lose an
-- entire round's reward over a boundary. The cap is enforced by summing
-- `reward_credited` already paid out by THIS user's OWN nisan_tapmacasi
-- sessions since the start of the current Baku day (a column on the sessions
-- table itself, so no separate ledger table is needed), then clamping this
-- round's computed reward down to `greatest(0, cap - already_credited)`.
-- Because the clamp is computed and applied inside the same transaction that
-- flips `used = true` and writes `reward_credited`, a user cannot exceed the
-- cap by racing concurrent submits (the `for update` row lock below plus the
-- atomic used-flip make each session settle exactly once).
--
-- Baku-day boundary conventions match 0070 exactly:
--   "today's date":          (now() at time zone 'Asia/Baku')::date
--   "start of today (tstz)": date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku'
--
-- Idempotent: safe to re-run (create table if not exists, create or replace
-- function, guarded alter table, seed via ON CONFLICT DO NOTHING). APPLY THIS
-- BY HAND in the Supabase SQL editor, after 0098_lesson_energy_unlock.sql.

-- ---------------------------------------------------------------------------
-- nisan_tapmacasi_questions — the curated question catalog. One row per sign:
-- bare code (matching the sign pool's code without the "Kod " prefix), the
-- short official label (the correct option text), and the hand-written hint.
-- ZERO policies: this is read-only service-role data (the lib reads it via
-- createAdminClient), same posture as app_settings — not queryable by the
-- client, so the correct answer can never leak through PostgREST.
-- ---------------------------------------------------------------------------
create table if not exists nisan_tapmacasi_questions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  label      text not null,
  hint       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table nisan_tapmacasi_questions enable row level security;

-- No select/insert/update/delete policies — service_role-only by default (RLS
-- with zero policies blocks every other role, including anon/authenticated).
grant select on nisan_tapmacasi_questions to service_role;

-- ---------------------------------------------------------------------------
-- nisan_tapmacasi_sessions — one row per round, server-authoritative question
-- set. EXACT mirror of sign_speed_sessions (0071).
-- ---------------------------------------------------------------------------
create table if not exists nisan_tapmacasi_sessions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references profiles(id) on delete cascade,
  question_codes   text[] not null,
  correct_indices  smallint[] not null,
  reward_credited  numeric not null default 0,
  issued_at        timestamptz not null default now(),
  used             boolean not null default false
);

alter table nisan_tapmacasi_sessions enable row level security;

drop policy if exists nisan_tapmacasi_sessions_select_own on nisan_tapmacasi_sessions;
create policy nisan_tapmacasi_sessions_select_own
  on nisan_tapmacasi_sessions for select
  to authenticated
  using (user_id = auth.uid());

-- No insert/update/delete policy — those only ever happen via the service-role
-- RPCs below (start_nisan_tapmacasi_round / settle_nisan_tapmacasi_round).
grant select, insert, update on nisan_tapmacasi_sessions to service_role;

create index if not exists nisan_tapmacasi_sessions_user_id_idx on nisan_tapmacasi_sessions(user_id);

-- ---------------------------------------------------------------------------
-- start_nisan_tapmacasi_round — spends the round-start energy AND inserts the
-- session row atomically. A no_energy failure creates NO row. Identical to
-- 0071's start_sign_speed_round, retargeted to nisan_tapmacasi_sessions.
-- ---------------------------------------------------------------------------
create or replace function start_nisan_tapmacasi_round(
  p_user_id             uuid,
  p_question_codes      text[],
  p_correct_indices     smallint[],
  p_daily_energy_grant  int,
  p_energy_cost         int
)
returns jsonb
language plpgsql
as $$
declare
  v_energy    int;
  v_session   uuid;
begin
  if p_question_codes is null or array_length(p_question_codes, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  if p_correct_indices is null or array_length(p_correct_indices, 1) <> 10 then
    raise exception 'invalid_questions';
  end if;
  if p_energy_cost is null or p_energy_cost <= 0 then
    raise exception 'invalid_energy_cost';
  end if;

  -- Lazy daily grant, then spend the round-start energy. Mirrors 0071's start
  -- function exactly.
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

  insert into nisan_tapmacasi_sessions (user_id, question_codes, correct_indices)
  values (p_user_id, p_question_codes, p_correct_indices)
  returning id into v_session;

  return jsonb_build_object('sessionId', v_session, 'energy', v_energy);
end;
$$;

revoke execute on function start_nisan_tapmacasi_round(uuid, text[], smallint[], int, int) from public, anon, authenticated;
grant execute on function start_nisan_tapmacasi_round(uuid, text[], smallint[], int, int) to service_role;

-- ---------------------------------------------------------------------------
-- settle_nisan_tapmacasi_round — grades a round, credits a daily-capped ENERGY
-- reward. Verbatim copy of the 0094 (two-currency) settle_sign_speed_round,
-- retargeted to nisan_tapmacasi_sessions. Energy is NOT spent here (already
-- spent at start); the reward pays ENERGY via credit_energy and user_coins is
-- only ever READ (unlocked) for the shared meter.
-- ---------------------------------------------------------------------------
create or replace function settle_nisan_tapmacasi_round(
  p_user_id              uuid,
  p_session_id           uuid,
  p_answers              int[],
  p_per_correct_reward   numeric,
  p_daily_reward_cap     numeric,
  p_session_ttl_seconds  int
)
returns jsonb
language plpgsql
as $$
declare
  v_question_codes   text[];
  v_correct_indices  smallint[];
  v_issued_at        timestamptz;
  v_correct_count    int := 0;
  v_correct_flags    boolean[] := array[]::boolean[];
  v_reward           numeric := 0;
  v_already_credited numeric;
  v_day_start        timestamptz := date_trunc('day', now() at time zone 'Asia/Baku') at time zone 'Asia/Baku';
  v_energy           int;
  v_balance          numeric;
  i                  int;
begin
  if p_answers is null or array_length(p_answers, 1) <> 10 then
    raise exception 'invalid_answers';
  end if;
  for i in 1..10 loop
    if p_answers[i] is null or p_answers[i] < 0 or p_answers[i] > 3 then
      raise exception 'invalid_answers';
    end if;
  end loop;

  -- Lock the session row first so concurrent submits of the same session
  -- serialize on this lock rather than racing the used-flip below.
  perform 1
    from nisan_tapmacasi_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

  if not found then
    raise exception 'session_not_found';
  end if;

  -- Atomic double-submit guard: the used-flip and the read of the session's
  -- content happen in the SAME statement, gated on used = false, so a second
  -- concurrent/racing submit of the same session_id returns no row here and
  -- is rejected, never double-credited.
  update nisan_tapmacasi_sessions
    set used = true
    where id = p_session_id
      and user_id = p_user_id
      and used = false
    returning question_codes, correct_indices, issued_at
    into v_question_codes, v_correct_indices, v_issued_at;

  if not found then
    raise exception 'already_used';
  end if;

  if v_issued_at < now() - make_interval(secs => p_session_ttl_seconds) then
    raise exception 'session_expired';
  end if;

  for i in 1..10 loop
    v_correct_flags := array_append(v_correct_flags, p_answers[i] = v_correct_indices[i]);
    if p_answers[i] = v_correct_indices[i] then
      v_correct_count := v_correct_count + 1;
    end if;
  end loop;

  v_reward := v_correct_count * p_per_correct_reward;

  -- Daily reward cap (Baku day boundary): clamp, don't reject — a round that
  -- pushes past the cap still credits whatever headroom is left. Sums this
  -- user's OTHER already-settled sessions' reward_credited today; this row's
  -- own reward_credited is still 0 at this point (default), so it is not
  -- double-counted.
  select coalesce(sum(s.reward_credited), 0) into v_already_credited
    from nisan_tapmacasi_sessions s
    where s.user_id = p_user_id
      and s.used = true
      and s.issued_at >= v_day_start;

  if v_already_credited + v_reward > p_daily_reward_cap then
    v_reward := greatest(0, p_daily_reward_cap - v_already_credited);
  end if;

  v_reward := round(v_reward);

  -- ENERGY payout (0094 invariant): credit_energy is the ONLY way this path
  -- credits anything. user_coins is read unlocked for the shared meter only —
  -- it is NEVER written here.
  v_energy := credit_energy(p_user_id, v_reward);
  v_balance := coalesce((select uc.balance from user_coins uc where uc.user_id = p_user_id), 0);

  update nisan_tapmacasi_sessions
    set reward_credited = v_reward
    where id = p_session_id;

  return jsonb_build_object(
    'balance', v_balance,
    'energy', v_energy,
    'correctCount', v_correct_count,
    'correctFlags', v_correct_flags,
    'reward', v_reward
  );
end;
$$;

revoke execute on function settle_nisan_tapmacasi_round(uuid, uuid, int[], numeric, numeric, int) from public, anon, authenticated;
grant execute on function settle_nisan_tapmacasi_round(uuid, uuid, int[], numeric, numeric, int) to service_role;

-- user_energy is intentionally NOT re-granted here: grant_daily_energy /
-- credit_energy are already service_role-executable and
-- `grant select, insert, update on user_energy to service_role` already exists
-- (0067 line 39 and again 0094 line 186). Mirror of 0071, which added no
-- user_energy grant for the same reason.

-- ---------------------------------------------------------------------------
-- Curated question catalog seed (31 rows). ON CONFLICT DO NOTHING so a re-run
-- never duplicates or overwrites admin edits. Label strings are verbatim
-- official sign names; hints must not simply restate the label.
-- ---------------------------------------------------------------------------
INSERT INTO nisan_tapmacasi_questions (code, label, hint) VALUES
('2.5','Dayanmadan keçmək qadağandır','Səkkizbucaqlı forması ilə digərlərindən seçilir — ağ fon üzərində qırmızı. Kəsişmədə mütləq tam dayanmağı tələb edir.'),
('3.1','Giriş qadağandır','Dairəvi, ağ fonda üfüqi qırmızı zolaq. Bu nişandan sonra heç bir nəqliyyat vasitəsi daxil ola bilməz.'),
('3.20','Ötmək qadağandır','Dairəvi, ağ fonda qırmızı haşiyə, içərisində qırmızı avtomobil təsviri. Qarşıda ötmənin qadağan olduğunu bildirir.'),
('3.24','Maksimum sürətin məhdudlaşdırılması','Dairəvi, ağ fonda qırmızı haşiyə, içərisində rəqəm. Bu rəqəmdən yuxarı sürətlə hərəkət etmək qadağandır.'),
('3.28','Durmaq qadağandır','Göy fon üzərində qırmızı xaç (X) təsviri olan dairəvi nişan. Bu yerdə nəqliyyat vasitəsinin dayanması qadağandır.'),
('3.13','Hündürlüyün məhdudlaşdırılması','Dairəvi, ağ fonda qırmızı haşiyə, içərisində yuxarı-aşağı oxlar arasında rəqəm. Körpü və ya tuneldən keçə bilən maksimum hündürlüyü göstərir.'),
('3.18.2','Sola dönmək qadağandır','Dairəvi, ağ fonda qırmızı haşiyə, içərisində sola dönən ox təsvirinin üzərindən qırmızı xətt keçir.'),
('3.26','Səs siqnalı vermək qadağandır','Dairəvi nişan, içərisində səs siqnalı (klakson) təsviri. Səssiz zonada qoyulur.'),
('2.1','Baş yol','Sarı rəngli, romb formasında. Bu yoldakı sürücülərin kəsişmələrdə üstünlük hüququ var.'),
('2.4','Yol ver','Tərs çevrilmiş üçbucaq formasında, ağ fonda qırmızı haşiyə. Kəsişməyə yaxınlaşanda qarşıdakı nəqliyyata üstünlük vermək lazımdır.'),
('1.20','Piyada keçidi','Üçbucaq formalı, içərisində zolaqlar üzərində addımlayan insan təsviri. Piyadaların yolu keçə biləcəyi yerdə qoyulur.'),
('1.21','Uşaqlar','Üçbucaq formalı, içərisində iki uşaq təsviri. Məktəb və uşaq bağçalarının yaxınlığında qoyulur.'),
('1.13','Sərt eniş','Üçbucaq formalı, içərisində aşağı meylli xətlər üzərində rəqəm. Yolun dik aşağı endiyi ərazidə qoyulur.'),
('1.14','Sərt yoxuş','Üçbucaq formalı, içərisində yuxarı qalxan xətlər üzərində rəqəm. Yolun dik yuxarı çıxdığı ərazidə qoyulur.'),
('1.15','Sürüşkən yol','Üçbucaq formalı, altında qıvrımlı cızıqlar olan avtomobil izi təsviri. Yağışlı və buzlu havada sürüşmə riski olan yerlərdə qoyulur.'),
('1.16','Nahamar yol','Üçbucaq formalı, içərisində qabarıq səthdə hərəkət edən avtomobil təsviri. Çuxurlu və ya qeyri-hamar yola yaxınlaşanda qoyulur.'),
('1.23','Yol işləri','Üçbucaq formalı, içərisində işçi və ya kürək təsviri. Yolda təmir işləri gedən yerdə qoyulur.'),
('1.19','İkitərəfli hərəkət','Üçbucaq formalı, içərisində yuxarı və aşağı istiqamətli iki ox təsviri. Qarşıdan gələn nəqliyyatla eyni yolda hərəkət ediləcəyini bildirir.'),
('1.10','Sahilboyuna çıxış','Üçbucaq formalı, içərisində dalğalar üzərində hərəkət edən avtomobil təsviri. Su hövzəsinin yaxınlığında qoyulur.'),
('4.1.2','Sağa hərəkət','Göy dairəvi nişan, içərisində sağa istiqamətlənmiş ağ ox. Bu nöqtədən sonra yalnız sağa hərəkət etmək olar.'),
('4.2.1','Maneəni sağdan keçmə','Göy dairəvi, içərisində maneəni sağdan keçməyi göstərən ağ ox. Yolun ortasındakı maneəni keçmə istiqamətini bildirir.'),
('4.3','Dairəvi hərəkət','Göy dairəvi, içərisində saat əqrəbi istiqamətində dönən üç ağ ox. Dairəyə daxil olan nəqliyyatın hərəkət istiqamətini göstərir.'),
('4.6','Piyada zolağı','Göy kvadrat formalı, içərisində zolaqlar üzərində addımlayan insan təsviri. Bu yerdən piyadaların keçə biləcəyini bildirir.'),
('5.5','Birtərəfli yol','Göy düzbucaqlı, içərisində ağ istiqamət oxu. Yolun yalnız bir istiqamətdə hərəkətə açıq olduğunu bildirir.'),
('5.16.1','Piyada keçidi','Göy kvadrat, içərisində zolaqlar üzərində addımlayan insan təsviri. Piyada keçidinin yerləşdiyi nöqtəni göstərir.'),
('5.22','Yaşayış məntəqəsinin başlanğıcı','Ağ fonlu düzbucaqlı, üzərində yaşayış məntəqəsinin adı yazılır. Bu nişandan sonra yaşayış məntəqəsi qaydaları qüvvəyə minir.'),
('5.19.1','Dalan','Göy düzbucaqlı, içərisində sağa istiqamətlənmiş ağ oxun üzərindən qırmızı xətt keçir. Qarşıda çıxışı olmayan küçənin olduğunu bildirir.'),
('6.1','İlk tibbi yardım məntəqəsi','Göy kvadrat, üzərində ağ xaç təsviri. Yaxınlıqda tibbi yardım məntəqəsinin olduğunu göstərir.'),
('6.3','Yanacaqdoldurma məntəqəsi','Göy kvadrat, üzərində yanacaq nasosu təsviri. Yaxınlıqda yanacaqdoldurma məntəqəsinin olduğunu göstərir.'),
('6.4','Avtomobillərə texniki xidmət','Göy kvadrat, üzərində açar təsviri. Yaxınlıqda avtomobil texniki xidmət məntəqəsinin olduğunu göstərir.'),
('6.15','Tualet','Göy kvadrat, üzərində tualet təsviri. Yaxınlıqda tualetin olduğunu göstərir.')
ON CONFLICT (code) DO NOTHING;

-- New admin-configurable tunables (house convention — NO seed rows; TS
-- defaults in lib/coins/nisanTapmacasi.ts):
--   nisan_tapmacasi_per_correct_reward  -- default 1   (ENERGY per correct answer)
--   nisan_tapmacasi_daily_reward_cap    -- default 20  (max ENERGY/day from this game, per user, Baku day)
--   nisan_tapmacasi_energy_cost         -- default 1   (energy spent per round-START)
--   nisan_tapmacasi_session_ttl_seconds -- default 180 (staleness ceiling for a round)
-- The daily ENERGY GRANT amount is NOT a new setting — it reuses
-- game_daily_energy (0067/games.ts), the one shared energy pool for the games
-- section (XO + Nişan Sürəti + this game).
