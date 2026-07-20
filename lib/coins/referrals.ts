import 'server-only';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Phase 2 of the coin roadmap (docs/coin-roadmap.md): referral bonus.
// Kept alongside lib/coins/transfers.ts and lib/coins/quiz.ts (not a
// separate lib/referrals/ tree) for consistency with the rest of the coin
// economy's file layout.

const REFERRAL_BONUS_KEY = 'referral_bonus_amount';
const DEFAULT_REFERRAL_BONUS_AMOUNT = 5;

// Max PAID referrals one referrer may collect in a rolling 30-day window
// (0059_security_hardening.sql, section D.1). Before this, referrer_id was
// entirely unconstrained — one account could refer unlimited accounts at +5
// each, which under this project's "email confirmation is disabled, accounts
// are free and unlimited" reality was an uncapped coin printer.
const REFERRAL_MAX_PER_30D_KEY = 'referral_max_per_30d';
const DEFAULT_REFERRAL_MAX_PER_30D = 10;

export {
  REFERRAL_BONUS_KEY,
  DEFAULT_REFERRAL_BONUS_AMOUNT,
  REFERRAL_MAX_PER_30D_KEY,
  DEFAULT_REFERRAL_MAX_PER_30D,
};

// Mirrors getQuizRewardAmount's/getTransferMinAmount's shape.
export async function getReferralBonusAmount(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', REFERRAL_BONUS_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_REFERRAL_BONUS_AMOUNT;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_REFERRAL_BONUS_AMOUNT;
  return value;
}

// Same shape as getReferralBonusAmount, but must additionally be a positive
// integer (it bounds a row count, not a coin amount) — mirrors
// getAdWatchDailyMax.
export async function getReferralMaxPer30d(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', REFERRAL_MAX_PER_30D_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_REFERRAL_MAX_PER_30D;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_REFERRAL_MAX_PER_30D;
  return Math.round(value);
}

const CODE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no O/I, avoids ambiguity
const CODE_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 5;

// Random 8-char code from a 34-symbol URL-safe alphabet (digits + A-Z minus
// O and I, to avoid visual ambiguity with 0 and 1 when a user reads the
// code aloud or types it in) — collisions at this scale (a few thousand
// users at most) are extremely unlikely, so the bounded retry loop below is
// defense-in-depth against the rare case, not the primary uniqueness
// mechanism (the DB's own unique constraint is).
function generateCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

// Reads profiles.referral_code for the user; if unset, generates one and
// attempts to persist it with a conditional update (`referral_code is
// null`) so a concurrent request racing this one can't clobber an
// already-assigned code. Retries a small, bounded number of times on a
// unique_violation (another user already has that exact code) or on
// losing the race to a concurrent call for the same user (in which case
// the next loop iteration's re-read picks up the winner's code).
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[coins] getOrCreateReferralCode read failed:', readError);
    throw new Error('referral_code_read_failed');
  }

  if (existing?.referral_code) return existing.referral_code;

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const candidate = generateCode();

    const { data: updated, error: updateError } = await admin
      .from('profiles')
      .update({ referral_code: candidate })
      .eq('id', userId)
      .is('referral_code', null)
      .select('referral_code')
      .maybeSingle();

    if (!updateError && updated?.referral_code) {
      return updated.referral_code;
    }

    // Either a unique_violation (code taken by someone else) or a
    // zero-row update (this user's referral_code got set by a concurrent
    // call in between our read and this update) — re-read in the latter
    // case to pick up the winner's code, otherwise just retry generation.
    const { data: reread } = await admin
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .maybeSingle();

    if (reread?.referral_code) return reread.referral_code;
  }

  console.error('[coins] getOrCreateReferralCode exhausted retries for user', userId);
  throw new Error('referral_code_generation_failed');
}

// Case-insensitive lookup, normalized to uppercase (codes are always
// generated uppercase — see CODE_ALPHABET — so this only matters for
// user-typed/pasted input that may have been lowercased by a URL or
// autocorrect).
export async function lookupReferrerByCode(code: string): Promise<{ id: string } | null> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id')
    .eq('referral_code', normalized)
    .maybeSingle();

  if (error || !data) return null;

  return { id: data.id };
}

interface ClaimPendingReferralRpcResult {
  bonus_claimed: boolean;
  referrer_balance: number | null;
  referred_balance: number | null;
}

type ReferralResult =
  | { ok: true; credited: boolean }
  | { ok: false; error: string };

// SIGNUP-TIME half. Records the relationship only — mints NOTHING.
//
// The bonus used to be granted here, at signup, before the referred account
// had done anything at all: with free unlimited accounts that meant coins for
// merely running the signup form. The relationship is now stored pending
// (referrals.bonus_claimed = false, which 0049's schema already supported)
// and paid later by claimPendingReferral below.
//
// Self-referral is still short-circuited without an RPC call. Behaviour
// contract is unchanged for the caller: an invalid code, a self-referral, a
// lookup failure or an RPC error must all fail silently/log-only and never
// block signup.
export async function recordPendingReferral(
  referrerId: string,
  referredId: string
): Promise<ReferralResult> {
  if (referrerId === referredId) {
    return { ok: true, credited: false };
  }

  const { data, error } = await createAdminClient().rpc('record_pending_referral', {
    p_referrer_id: referrerId,
    p_referred_id: referredId,
  });

  if (error) {
    console.error('[coins] record_pending_referral RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    const message = error.message ?? '';
    if (message.includes('self_referral')) return { ok: true, credited: false };
    return { ok: false, error: 'error' };
  }

  // `credited` here means "relationship recorded", never "coins paid" — no
  // coins are minted on this path at all.
  return { ok: true, credited: data === true };
}

// USAGE-TIME half, called from the chat route's post-stream success path.
// Pays out the pending referral (if any) once the referred account has
// demonstrated real usage by completing its first chat message.
//
// The referrer is looked up from the pending row inside the RPC and is never
// supplied by a caller, so this takes only the referred user's id — there is
// no parameter an attacker could point at an account of their choosing.
//
// Best-effort by design: a no-op (no pending referral, or the referrer is
// over their 30-day cap) is { ok: true, credited: false }, not an error, and
// the caller discards the result entirely.
export async function claimPendingReferral(referredId: string): Promise<ReferralResult> {
  const [bonusAmount, maxPer30d] = await Promise.all([
    getReferralBonusAmount(),
    getReferralMaxPer30d(),
  ]);

  const { data, error } = await createAdminClient()
    .rpc('claim_pending_referral', {
      p_referred_id: referredId,
      p_bonus_amount: bonusAmount,
      p_max_per_30d: maxPer30d,
    })
    .single<ClaimPendingReferralRpcResult>();

  if (error) {
    console.error('[coins] claim_pending_referral RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, error: 'error' };
  }

  if (!data) return { ok: false, error: 'error' };

  return { ok: true, credited: data.bonus_claimed };
}
