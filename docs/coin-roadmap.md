# Coin & energy economy

## CURRENT MODEL — two currencies (2026-08-01, `0094_two_currency_economy.sql`)

**This section supersedes everything below it.** The rest of this file is the
original single-currency roadmap, kept as history — most of it shipped, but its
currency assignments are now wrong. Read this section first.

The economy was split into two currencies with deliberately separate roles:

| | **Coin** | **Energy** |
|---|---|---|
| Role | Premium / scarce | Gameplay |
| Sinks | Chat messages, official exam, garage cars, VIP plates | All games |
| Income | Daily **top-up** to `daily_coin_grant` + ad watch + weekly-marathon day-7 (streak) chest + energy→coin | Daily **top-up** to `game_daily_energy` + every game reward + per-mission daily-quest energy |
| Accumulates | Yes | Yes (since 0094 — see below) |
| Future | **Sold for real money** (~50 coins ≈ 20 AZN) | Never sold |

### The invariant, with one owner-sanctioned exception (0096)

Coin → energy purchase is allowed and is a legitimate money sink. The inverse
exists in exactly ONE form, added by `0096_energy_to_coin.sql`: the daily-capped
`energy_to_coin` path (default 100 energy → 1.5 coins, per-account per-Baku-day
cap `energy_to_coin_daily_cap` = 100, ledgered in `energy_to_coin_conversions`).
That cap is the real bound against the free-account abuse model (free energy ×
unlimited accounts → sellable coins); the coin→energy→coin roundtrip is ~97%
lossy so it is not a vector — free energy is. Any other energy-spending path
that credits coins reopens the farming loop.

Verified at 0096 time: the only `user_coins` writes outside `claim_daily_grant`
(which grants, never converts) are `convert_energy_to_coins` (the sanctioned
exception) and `claim_daily_chest` **on the streak-day-7 (COINS) slot**
(`0097_daily_quest_split.sql`, streak-day-indexed `weekly_marathon_rewards`)
— a free coin income (no mission gate since 0097), not a conversion.
`settle_tictactoe`, `settle_sign_speed_round`, `start_exam_session`,
`claim_wheel_spin` and `claim_daily_quiz_*` still read coins only for the shared
UI meter. **Any future change that makes a game or an energy-spending path
credit coins reopens the loop — re-run that check.**

### What moved to energy

Daily quiz, daily chest (streak days 1–6 pay energy; streak day 7 pays coins
via the `0097` streak-indexed marathon — free, no mission gate, a missed day
resets to day 1), wheel of fortune, per-mission daily-quest rewards (each of
today's missions pays its own energy via `claim_daily_mission`), sign-speed
game, XO wins, streak milestones. Ad watch and referral stayed on coins.

### The daily grant is a top-up to a floor, not an increment

Once per Baku day, each balance is raised **to** its configured floor if below
it, and left completely alone if at or above it. Floor 3: balance 2 → 3;
balance 6 → 6, nothing granted. Surpluses are never reduced, so energy earned
from games survives midnight. It is automatic — applied on the first
server-side balance read of the day, with no claim button.

**The gate is the `daily_grant_claims` ledger row, never `balance < floor`.**
Otherwise: top up to 3 → spend 3 on chat → balance 0 → next read sees `0 < 3`
→ top up again, forever. Concurrency is handled by `unique(user_id,
grant_date)` — the second inserter blocks on the first's uncommitted tuple
rather than seeing an empty table. Energy has its own equivalent marker,
`user_energy.last_grant_date`.

There is exactly **one** recurring grant per currency: `daily_coin_grant`
(default 10) and `game_daily_energy` (default 10). An additive `daily_grant_coins`
key existed briefly and was retired before reaching any live database —
two independent daily coin grants keyed on two different markers was the
double-payment bug this design exists to prevent.

### Bounded income (per user, per Baku day, at defaults)

- **Energy: 144/day absolute worst case**, 69 on a normal (non-milestone) day —
  10 grant + 3 quiz + 75 day-30 streak milestone + 20 wheel max + 10 chest +
  6 XO + 20 sign-speed. Games are allowed to be net-positive for a skilled
  player; that is safe **only because every game has a server-enforced daily
  earning cap.** Adding a game without one breaks the bound.
- **Coin: 15/day maximum** — the floor contributes at most 10 (and only to a
  balance that actually hit 0), plus 5 from ad watch.

### Open decisions

1. ✅ **Resolved.** The two overlapping daily coin grants were consolidated into
   one: `daily_coin_grant` survives, the additive `daily_grant_coins` was
   retired. **Its default is still 10** — the owner sets the real figure from
   the admin panel. `0` is now an accepted value (it used to be rejected as
   "not configured"), but `0` also removes the free chat allowance entirely.
2. **Legacy balances were intentionally not wiped or converted.** Coins earned
   at the old 10–20/day rate are worth considerably more under the new scarcity.
   Top-up semantics reinforce this: a balance above the floor is never reduced.

---

# (Historical) Roadmap: peer-to-peer coin transfer + coin-earning mechanisms

Status: **shipped**, and partly superseded — the transfer and daily-quiz
mechanics below are live, but the quiz now pays **energy**, not coins. Kept for
the design rationale and the anti-abuse reasoning, which still apply.

## Context

The coin economy (chat message gating, admin grants, balance display) works
correctly as of this doc. Two new user-facing features are planned: (1) users
can send coins they've earned to another user, and (2) users can earn coins by
completing a task or watching ads (exact task type intentionally left open —
to be decided before Phase 1 build starts in earnest).

Decisions made so far:
- Both mechanisms are planned now, but ad-based earning is explicitly Phase 2
  — Phase 1 is task-based only, no ad SDK.
- Transfer anti-abuse rule (exact spec): a user cannot transfer away their
  daily free allowance. Transferable amount = `max(0, balance -
  effective_daily_limit)` — e.g. balance 15, daily_limit 10 → only 5
  transferable. Plus a daily transfer cap and a minimum transfer amount
  (exact numbers TBD, admin-configurable, recommend 1 min / 20 per day).
- Delivered as a phased roadmap so each phase can be approved/built
  separately.

## Key finding that removes the biggest constraint

CLAUDE.md's Vercel Hobby 12-function cap (currently 10 `route.ts` files +
`proxy.ts` = 11/12, effectively no headroom) does **not** block this work:
`app/account/actions.ts` already establishes a **Next.js Server Actions**
pattern for account-page mutations (`'use server'`, calling
`createAdminClient()` directly — see `changePassword`/`deleteAccount` there).
Server Actions are not `route.ts` files and don't count against the
Serverless Function cap. **Both new features will be built as server
actions, not new API routes** — zero impact on the route budget.

## Phase 1: P2P transfer + daily-quiz earning

**New migration `0041_coin_transfers.sql`**: `coin_transfers` table
(`sender_id`, `recipient_id`, `amount`, `created_at`; RLS: self-select only,
i.e. `sender_id = auth.uid() or recipient_id = auth.uid()`) + a
`transfer_coins(p_sender_id, p_recipient_id, p_amount, p_default_daily_limit)`
RPC modeled on `check_and_reserve_coins`/`debit_coins`
(`supabase/migrations/0036_coin_economy.sql`,
`0040_fix_check_and_reserve_coins_ambiguity.sql`):
- Row-locks both users' `user_coins` rows in a **consistent order** (by
  `user_id`, e.g. `if sender_id < recipient_id then ... else ...`) to prevent
  deadlock on simultaneous opposite-direction transfers.
- Computes transferable amount server-side using the exact rule above and
  raises an exception (fail-**closed**, unlike the fail-open message-gating
  RPCs — a transfer is a deliberate financial action) if insufficient.
- Alias-qualifies all column references (`from user_coins uc where
  uc.user_id = ...`) to avoid the ambiguous-column trap that broke
  `check_and_reserve_coins` originally (0040's fix).
- Needs **both** `grant execute ... to service_role` and `grant select,
  insert, update on user_coins/coin_transfers to service_role` — the
  EXECUTE-grant-alone gotcha that caused three earlier production bugs in
  this coin economy.

**New migration `0042_daily_quiz_claims.sql`**: chosen Phase 1 earning
mechanic is a **daily traffic-law mini-quiz** (thematically fits this app,
zero external dependency — login-streak and referral are viable later
additions but not built now). `daily_quiz_claims` table with `unique
(user_id, claim_date)` to prevent double-claiming, plus a
`claim_daily_quiz_reward(p_user_id, p_reward)` RPC (insert-then-credit,
unique violation naturally rejects a second same-day claim). A small static
question bank lives in code (`lib/quiz/questions.ts`), not a table — one
pseudo-random question per user per day, seeded by date+user id.

**New server-side modules**: `lib/coins/transfers.ts` and `lib/coins/quiz.ts`
(new home, not `lib/chat/coins.ts` — that file's existing comments are
chat-gating-specific and its fail-open posture doesn't fit these fail-closed
operations). Both call the RPCs via `createAdminClient()`, following
`lib/chat/coins.ts`'s existing style (typed returns, explicit error
handling) but fail-closed: return `{ ok: false, error }` on any failure,
never assume success.

**Server actions**: add `transferCoins` to `app/account/actions.ts`
(mirrors `changePassword`'s auth-check-then-mutate shape) and a new
`claimDailyQuizReward` action (`app/account/actions.ts` or a small
`app/chat/actions.ts` if that's a cleaner fit once the file is open).
Transfer/quiz *history reads* need no action at all — plain server-side
`createAdminClient()` selects directly in the relevant page component, same
pattern `getCoinBalanceStatus` already uses.

**Frontend touchpoints**:
- `/account`: "Coin göndər" form (recipient email + amount) next to the
  existing coin balance card, plus sent/received transfer history.
- Chat page / `CoinBadge`: a small "Bugünkü sual" entry point into the daily
  quiz (keep it out of the hot chat-send path — a link/modal, not inline).
- `/admin/users/[id]`: optionally surface a user's transfer history
  read-only, for support/abuse investigation — no new logic, just a query.

**Risks to resolve before/during build**:
- Recipient lookup by email risks account-enumeration — use one generic
  error for both "not found" and "that's you" cases, and rate-limit transfer
  attempts per sender.
- `transfer_coins`'s Postgres exceptions need mapping to clean Azerbaijani
  messages in the server action, never surfaced raw.
- Same-question-until-correct same-day quiz has a soft-abuse surface (no
  cost to guessing) — acceptable for Phase 1, revisit if abused.
- Exact transfer min/daily-cap and quiz reward amount are placeholders
  pending sign-off, stored in `app_settings` (same pattern as
  `chat_message_price`) so they're tunable without a migration.

## Phase 2 (deferred): ad-based earning

Not designed in detail yet — genuinely blocked on a product decision (which
ad network/SDK, e.g. Google AdSense rewarded ads vs. another provider) that's
out of scope for now. `components/AdSlot.tsx` is currently a pure no-op
placeholder (`NEXT_PUBLIC_ADS_ENABLED` gated, no SDK, no callback hooks) —
Phase 2 starts from zero on the ads side. When ready: needs a rewarded-ad SDK
integration, a server-verifiable "ad watched" callback (client-only
confirmation is trivially spoofable — do not credit coins on a bare client
event), and likely a new `ad_reward_claims` table mirroring
`daily_quiz_claims`'s double-claim protection. Revisit with explicit sign-off
before starting, per CLAUDE.md's standing note that monetization decisions
need it.

## Verification (once Phase 1 is implemented)

- `npx tsc --noEmit` / `npm run lint` clean.
- Manually test transfer: two non-admin test accounts, confirm (a) transfer
  respects the `balance - daily_limit` transferable cap, (b) concurrent
  opposite-direction transfers between the same two accounts don't deadlock
  (fire both near-simultaneously), (c) transfer history shows correctly for
  both sender and recipient on `/account`.
- Manually test quiz: claim once, confirm second same-day claim attempt is
  rejected; confirm reward reflects in balance and `/account`'s coin card.
- Confirm no new `route.ts`/`route.tsx` files were added (route budget
  unaffected) — `find app -name "route.ts" -o -name "route.tsx" | wc -l`
  should still read 10.
