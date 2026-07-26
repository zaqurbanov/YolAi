# Roadmap: "Nişan Sürəti" — timed sign-knowledge speed quiz

Status: planned, not yet implemented. Single-phase plan.

## Context

Retention feature #2 in the games line (after XO). The user asked "what else
keeps people on the site / what other game" — the answer chosen here is
deliberately **skill-based, not chance-based**: XO and the wheel already cover
the "small daily dopamine hit" niche; adding another pure-chance game would
only compound the legal/abuse surface already flagged for those (CLAUDE.md
coin-abuse section). A sign-recognition speed quiz instead **reinforces the
app's actual educational purpose** (traffic-sign knowledge) while giving a
second reason to open `/coin-qazan` daily — dual benefit, and it sidesteps the
gambling-adjacent concerns entirely because there's no house edge or "win
big" framing, just correctness + speed.

## Key finding that removes the biggest unknown

The obvious way to build "show a sign, guess what it means" would need a
picture per sign — no such image asset library exists in this repo
(`public/nisanlar.pdf` is the only sign asset, and it's a whole-document PDF,
not per-sign images). Extracting/licensing 200+ individual sign images would
be the single biggest effort item in this plan.

**That whole problem is already solved by data that exists today.** The
ingested "Yol Nişanları" document has **216 chunks**, one per sign, each
shaped `article_label = "Kod X.Y"` + `content = <official description>` (e.g.
`Kod 2.5` → "Dayanmadan keçmək qadağandır..."). This is exactly
`splitCodeCatalogEntries()`'s output (`lib/ingestion/chunkText.ts`, documented
in CLAUDE.md's "Chunking has a catalog-table strategy" section) — the corpus
was already chunked one-sign-per-row for this exact shape of data. ~176/216
entries are under 120 characters (clean, single-sentence descriptions); the
rest are longer legal-explanation entries and should be filtered out of the
game's question pool (kept in the corpus for chat/RAG, just not used as quiz
material — a long paragraph doesn't fit a timed multiple-choice UI).

**Game shape, given this:** show the sign **code** (e.g. "Kod 2.5"), ask the
user to pick its correct **description** from 4 options (1 correct + 3
distractors, all real descriptions from other entries in the same pool). This
needs **zero LLM calls at play time** — it's pure random sampling over
already-chunked, already-verified real content, so it inherits the app's
anti-hallucination posture for free (every answer option is a literal quote
from the ingested document, never invented).

## Reused patterns (all already built and audited in this codebase)

Three existing mechanisms compose directly into this feature — no new pattern
class needs inventing:

1. **Single-use server-issued session token**, same shape as
   `ad_view_tokens`/`issueAdViewToken` (`lib/coins/adWatch.ts`): the server
   picks the question set + correct answers up front, stores them server-side
   keyed by a session row, and the elapsed time from issue to submit is
   compared against the server's own clock — never trusting a client-reported
   duration (exactly how the ad-watch flow already stops a client from lying
   about how long it waited).
2. **Energy-gated play**, same shape as XO (`user_energy` from
   `0067_xo_energy_rewards.sql`): starting a round costs 1 energy from the
   same daily pool XO already uses (not a separate pool — one energy budget
   for "the games section" as a whole, simpler for the user to reason about:
   "10 enerjin var, XO-ya da, Nişan Sürətinə də sərf edə bilərsən").
3. **Daily-capped, server-recomputed reward ceiling**, same shape as
   `settle_tictactoe`: coins are credited per correct answer in the session,
   the RPC re-derives the maximum possible payout from the session's own
   stored correct-count and rejects anything above it, and a
   per-user-per-UTC-day (well — per-Baku-day, per `lib/date/baku.ts`) reward
   cap bounds total daily extraction regardless of how many rounds are played.

## Game mechanics

- **One round = 10 questions.** Each question: a sign code + 4 shuffled
  description options (1 correct, 3 distractors sampled from other pool
  entries, never repeating a distractor already used as a correct answer in
  the same round, so a sharp user can't reverse-engineer "the one I haven't
  seen must be it" over a single round).
- **Server picks the pool + correct answers at round-start** (a session
  action), sends the client only `{ sessionId, questions: [{ code, options:
  string[4] }] }` — never which index is correct.
- **Client answers all 10 locally** (own component state, no round-trip per
  question — keeps it snappy), then submits `{ sessionId, answers: number[]
  }` once, on round end or a client-side timer expiring (e.g. 60s total for
  the round — enforced server-side too: elapsed time since session issue must
  be ≤ some generous ceiling, e.g. 3 minutes, purely to reject a stale/replayed
  session, not to grade speed strictly).
- **Server grades**: compares submitted indices against the session's stored
  correct indices, computes `correctCount` (0-10). Reward = `correctCount *
  per_correct_coin` (small, e.g. 1 coin per correct answer, so a perfect round
  = 10 coins — tune via `app_settings`), capped by the daily reward cap RPC
  logic (mirrors `tictactoe_daily_win_cap`, e.g. `sign_speed_daily_reward_cap`
  coins/day total from this game, admin-tunable).
- **1 energy per round-start** (not per question) — same energy pool as XO.
- Speed is NOT scored numerically in v1 (avoids needing strict per-question
  server timing) — framed as "sürət" for the UX (a countdown bar creates
  urgency) but the reward formula only depends on correctness. A speed bonus
  can be a fast-follow once the UX is proven.

## Schema (new migration, hand-applied — number after whatever is latest
   when build starts, e.g. `0071_sign_speed_game.sql`)

- `sign_speed_sessions` table: `id uuid pk, user_id uuid fk profiles,
  question_codes text[] (10 sign codes, in order), correct_indices smallint[]
  (10 values 0-3, in order), issued_at timestamptz default now(), used
  boolean default false`. RLS: self-select-only (mirrors every other
  claim/session table in this economy). No update/delete policy —
  service-role only, from inside the settle RPC.
- `settle_sign_speed_round(p_user_id, p_session_id, p_answers int[],
  p_per_correct_reward numeric, p_daily_reward_cap numeric, p_energy_cost
  int)` RPC: loads the session (must belong to `p_user_id`, `used = false`,
  `issued_at` within the generous staleness ceiling), marks it `used = true`
  in the same statement (so a session can never be submitted twice — the
  in-place `used` flip is the double-submit guard, same idea as
  `daily_quiz_claims`'s `unique(user_id, claim_date)` but per-session instead
  of per-day), grades `p_answers` against `correct_indices` server-side,
  spends the energy (same `grant_daily_energy` + conditional decrement
  pattern as `settle_tictactoe`), computes and caps the reward using the Baku
  day boundary, credits `user_coins`, and returns `{ balance, energy,
  correctCount, reward }`. House-style grants (`revoke ... from public, anon,
  authenticated` + `grant ... to service_role`), fail-closed throughout.
- app_settings tunables (documented, not seeded, TS defaults in
  `lib/coins/signSpeed.ts`): `sign_speed_per_correct_reward` (default 1),
  `sign_speed_daily_reward_cap` (default 20), `sign_speed_energy_cost`
  (default 1), `sign_speed_session_ttl_seconds` (default 180 — staleness
  ceiling for a round).

## Backend modules

- `lib/coins/signPool.ts`: reads the "Yol Nişanları" document's chunks once
  (find the document by title, same pattern
  `lib/content/categoryContent.ts`/others use for a one-off admin-client
  read), filters to entries with `content.length <= 150` (tunable constant),
  dedupes near-identical descriptions if any, and exposes `getSignPool():
  Promise<{ code: string; description: string }[]>`. Consider caching this
  in-process per server instance (it changes only when someone re-ingests the
  document) rather than re-querying every round-start — a simple
  module-level cache with a short TTL (e.g. 10 minutes) is enough; no need
  for Next's fetch cache machinery since this is a service-role Supabase
  call, not a fetch().
- `lib/coins/signSpeed.ts`: `startSignSpeedRound(userId)` — draws 10 pool
  entries without replacement, builds each question's 4 shuffled options
  (1 correct + 3 distractors drawn from the remaining pool, excluding
  descriptions already used as a correct answer this round), inserts the
  session row, returns the client-safe payload (codes + option text, no
  correct-index). `submitSignSpeedRound(userId, sessionId, answers)` — calls
  the settle RPC, maps Postgres exceptions
  (`session_not_found`/`already_used`/`session_expired`/`no_energy`) to typed
  results, mirrors `lib/coins/games.ts`'s existing error-mapping shape.

## Server actions + frontend

- `app/coin-qazan/actions.ts`: `startSignSpeedRoundAction()` and
  `submitSignSpeedRoundAction(sessionId, answers)` — same file the XO/wheel
  actions already live in, same auth-check-first shape.
- New component `components/games/SignSpeedGame.tsx`, added to
  `GamesSection.tsx` alongside XO (or as a new card if the section gets
  crowded — decide at build time based on how `GamesSection` reads once XO +
  wheel are both in view). UI: code prominently shown, 4 option buttons, a
  visual countdown bar per round (not per question) for urgency, a result
  screen showing `correctCount/10` and the coin reward, reusing the
  `AnimatedNumber` count-up already built for the coin balance.
- Reuses the existing energy meter display (`getEnergyStatus`) — no new
  energy UI needed, XO and this game share one number.

## Future extension: real sign images (deliberately deferred)

v1 ships text-only (code → description) — no image asset library exists yet
(`public/nisanlar.pdf` is a whole-document PDF, not per-sign cutouts), and
building one is a separate, non-trivial effort (extracting/cropping/naming
200+ images, or sourcing a licensed icon set). Deferred, not abandoned: the
pool shape (`{ code, description }` in `lib/coins/signPool.ts`) is designed so
an optional `imageUrl` field can be added later without a breaking change —
once images exist (e.g. uploaded per-code into a `public-assets` bucket by an
admin control mirroring `BackgroundImageControl`), the frontend swaps the
code-text display for an `<Image>` and the rest of the game (session/scoring/
economics) is unaffected.

## Risks / open questions to resolve before/during build

- Pool size (~180 usable entries) is comfortable for now but will feel
  repetitive after many days of daily play — track this and consider
  widening the source (other catalog-style documents, if any get ingested
  later) rather than over-engineering variety on day one.
- Distractor quality: some sign descriptions are similar enough (e.g. several
  "qadağan nişanları" phrased alike) that a naive random distractor pick could
  make a question trivially easy or unfairly hard depending on which 3 got
  drawn. Acceptable for v1 (still real content, still fair in expectation);
  a "similar-length distractor" heuristic is a cheap improvement if it proves
  too easy/hard in practice.
- Confirm at build time whether other ingested documents also produce
  clean catalog-style chunks (broadening the pool) — `splitCodeCatalogEntries`
  fires for any zero-Maddə/Fəsil/Bölmə document, not just this one.

## Verification (once implemented)

- `npx tsc --noEmit` / `npm run lint` clean.
- Confirm the new migration is idempotent (`create or replace` for the
  function; `create table if not exists` for the session table) and tell the
  user exactly which file to run in Supabase.
- Manually test: start a round, submit answers, confirm `correctCount` matches
  what was actually selected; confirm a second submit of the same
  `sessionId` is rejected (`already_used`); confirm energy drops by exactly 1
  per round-start regardless of score; confirm the daily reward cap actually
  caps a user who plays many rounds in one Baku day.
- No new `route.ts` file — server actions only, route budget unaffected.
