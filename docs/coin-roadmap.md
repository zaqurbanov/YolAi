# Roadmap: peer-to-peer coin transfer + coin-earning mechanisms

Status: planned, not yet implemented. This is a phased roadmap — Phase 1 ships
first, Phase 2 (ads) is deferred pending a product decision.

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
