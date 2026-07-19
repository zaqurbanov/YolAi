import 'server-only';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Phase 2 of the coin roadmap (docs/coin-roadmap.md): referral bonus.
// Kept alongside lib/coins/transfers.ts and lib/coins/quiz.ts (not a
// separate lib/referrals/ tree) for consistency with the rest of the coin
// economy's file layout.

const REFERRAL_BONUS_KEY = 'referral_bonus_amount';
const DEFAULT_REFERRAL_BONUS_AMOUNT = 5;

export { REFERRAL_BONUS_KEY, DEFAULT_REFERRAL_BONUS_AMOUNT };

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

interface GrantReferralBonusRpcResult {
  bonus_claimed: boolean;
  referrer_balance: number | null;
  referred_balance: number | null;
}

type GrantReferralBonusResult =
  | { ok: true; credited: boolean }
  | { ok: false; error: string };

// Fail-closed wrapper around grant_referral_bonus, mirroring
// transferCoins'/claimDailyQuizReward's error-mapping style: never throws,
// logs the raw Postgres error server-side, returns a short internal error
// code. Self-referral is short-circuited here WITHOUT calling the RPC —
// per the task spec, an invalid code or self-referral must fail
// silently/log-only and never block signup, so the caller (the signup
// action) is expected to swallow both the { ok: true, credited: false }
// and { ok: false, ... } cases without surfacing anything to the user.
export async function grantReferralBonus(
  referrerId: string,
  referredId: string
): Promise<GrantReferralBonusResult> {
  if (referrerId === referredId) {
    return { ok: true, credited: false };
  }

  const bonusAmount = await getReferralBonusAmount();

  const { data, error } = await createAdminClient()
    .rpc('grant_referral_bonus', {
      p_referrer_id: referrerId,
      p_referred_id: referredId,
      p_bonus_amount: bonusAmount,
    })
    .single<GrantReferralBonusRpcResult>();

  if (error) {
    console.error('[coins] grant_referral_bonus RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    const message = error.message ?? '';
    if (message.includes('self_referral')) return { ok: true, credited: false };
    return { ok: false, error: 'error' };
  }

  if (!data) return { ok: false, error: 'error' };

  return { ok: true, credited: data.bonus_claimed };
}
