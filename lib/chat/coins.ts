import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatMsUntilReset } from '@/lib/format/coins';
import { ADMIN_CONTACT_EMAIL } from '@/lib/contact';
import { logError } from '@/lib/logging/logError';
import { getActiveGaragePerk } from '@/lib/garage/perks';
import { msUntilNextBakuDayStart } from '@/lib/date/baku';
import { applyDailyGrant } from '@/lib/coins/dailyGrant';
import { getActiveSubscription } from '@/lib/billing/subscriptions';

// Hardcoded TS default (not an env var) — this is a brand-new concept with
// no prior env var to preserve compatibility with, unlike
// CHAT_RATE_LIMIT_MAX_PER_DAY in lib/chat/rateLimit.ts.
const DEFAULT_MESSAGE_PRICE = 1;
const DEFAULT_DAILY_LIMIT = 10;

// Exported so app/api/admin/chat-meta/route.ts can read/write the same
// app_settings row without duplicating the key.
export const COIN_PRICE_SETTING_KEY = 'chat_message_price';
export const DAILY_COIN_GRANT_SETTING_KEY = 'daily_coin_grant';
export { DEFAULT_MESSAGE_PRICE, DEFAULT_DAILY_LIMIT };

interface ReserveCoinsResult {
  allowed: boolean;
  balance: number;
  daily_limit: number | null;
}

// Reads the admin-configurable global message price from app_settings,
// falling back to DEFAULT_MESSAGE_PRICE when no row exists or the query
// errors — fail-open bias consistent with getGlobalDefaultMaxPerWindow in
// lib/chat/rateLimit.ts: infra hiccups on this read must never block chat
// (a wrong price of 1 is a much smaller harm than blocking every request).
export async function getGlobalMessagePrice(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', COIN_PRICE_SETTING_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_MESSAGE_PRICE;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_MESSAGE_PRICE;
  return value;
}

// Reads the admin-configurable global daily coin grant from app_settings,
// falling back to DEFAULT_DAILY_LIMIT when no row exists or the query errors
// — same fail-open bias as getGlobalMessagePrice above.
//
// 0 IS A VALID CONFIGURED VALUE (`value >= 0`, not `> 0`). This is the FLOOR
// the balance is raised to once per Baku day by apply_daily_grant (0094) — the
// app's oldest and largest coin income — and coins are money-equivalent since the
// two-currency split (0094). Rejecting 0 as "not configured" meant the owner
// literally could not switch this income off. The fallback still applies to a
// MISSING or non-numeric value, so an infra hiccup can't silently zero it.
export async function getGlobalDailyCoinGrant(): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', DAILY_COIN_GRANT_SETTING_KEY)
    .maybeSingle();

  if (error || !data) return DEFAULT_DAILY_LIMIT;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DAILY_LIMIT;
  return value;
}

// Checks whether the user has enough balance to afford one message at the
// current global price, creating their user_coins row as needed, but does NOT
// decrement — see debitCoins below. Called before any conversation/message
// rows are created or any retrieval/LLM work starts, so a rejected request
// costs nothing.
//
// applyDailyGrant runs FIRST and deliberately so: a user sitting at 0 coins
// must be topped up to today's floor before being told they cannot afford a
// message. The RPC itself no longer contains any grant logic (0094).
export async function checkAndReserveCoins(
  userId: string,
): Promise<{ allowed: boolean; balance: number | null; dailyLimit: number | null; price: number; message: string | null }> {
  await applyDailyGrant(userId);

  const price = await getGlobalMessagePrice();
  const baseDailyGrant = await getGlobalDailyCoinGrant();
  // Mercedes G-Class garage perk: +chatDailyBonus flat on top of the global
  // daily free-message limit. Not cumulative with any other tier's perk.
  const garagePerk = await getActiveGaragePerk(userId);
  // Must stay identical to resolveCoinFloor() in lib/coins/dailyGrant.ts — that
  // one decides what the balance is topped up TO, this one is what the user is
  // TOLD their limit is. If the two drift, a subscriber is quoted a limit they
  // do not have. A subscription raises the floor and never lowers it, hence
  // Math.max in both places.
  const subscription = await getActiveSubscription(userId);
  const dailyGrant = Math.max(
    baseDailyGrant + garagePerk.chatDailyBonus,
    subscription?.coinDailyFloor ?? 0
  );
  const { data, error } = await createAdminClient()
    .rpc('check_and_reserve_coins', {
      p_user_id: userId,
      p_price: price,
    })
    .single<ReserveCoinsResult>();

  if (error) {
    void logError('chat.coins.reserve', error, { userId });
    console.error('[chat] coin reservation check failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    // fail open — infra hiccup shouldn't block chat, mirrors
    // checkChatRateLimit's fail-open behavior in lib/chat/rateLimit.ts.
    // balance: null (not 0) so callers/messageMetadata omit coins metadata
    // entirely instead of visibly showing a wrong "0" to the user.
    return { allowed: true, balance: null, dailyLimit: null, price, message: null };
  }

  if (!data.allowed) {
    // The reset boundary is a Baku CALENDAR day, so the countdown is pure
    // arithmetic — no extra DB read (and no recursive applyDailyGrant call via
    // getCoinBalanceStatus, which this used to do).
    const msUntilReset = msUntilNextBakuDayStart();
    const effectiveLimit = data.daily_limit ?? dailyGrant;
    return {
      allowed: false,
      balance: data.balance,
      dailyLimit: data.daily_limit,
      price,
      message: `Gündəlik pulsuz limitiniz (${effectiveLimit} coin) bitib. Balansınız ${formatMsUntilReset(msUntilReset)} sonra yenilənəcək. Limitinizi artırmaq istəyirsinizsə, ${ADMIN_CONTACT_EMAIL} ünvanına müraciət edə bilərsiniz.`,
    };
  }

  return { allowed: true, balance: data.balance, dailyLimit: data.daily_limit, price, message: null };
}

// Debits exactly `price` coins from the user's balance, clamped at 0.
// Called only after a fully successful LLM response (streamText's onFinish
// in app/api/chat/route.ts) — never on error or client abort.
export async function debitCoins(userId: string, price: number): Promise<number | null> {
  const { data, error } = await createAdminClient().rpc('debit_coins', {
    p_user_id: userId,
    p_price: price,
  });

  if (error) {
    void logError('chat.coins.debit', error, { userId, details: { price } });
    console.error('[chat] coin debit failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }

  return typeof data === 'number' ? data : null;
}

// Balance lookup for GET /api/chat?type=quota, the account page and every
// other server-rendered coin meter.
//
// It APPLIES today's automatic top-up first (0094) and then reads the real
// row. It used to instead SIMULATE the top-up — `resetDue ? max(balance,
// limit) : balance` — showing a floored figure the table didn't actually hold.
// With the grant automatic there is nothing to simulate: the number displayed
// is the number stored. applyDailyGrant is idempotent per Baku day, so the
// many read paths that call this cannot compound it.
//
// The countdown is now "ms until the next Baku 00:00" (lib/date/baku.ts) —
// the same boundary the SQL uses — instead of a rolling 24h off
// user_coins.last_reset_at. last_reset_at is still WRITTEN by
// apply_daily_grant (it is a useful "when did this user last receive the
// floor" audit column and other tooling may read it), it is just no longer
// what the countdown is derived from.
export async function getCoinBalanceStatus(
  userId: string,
): Promise<{ balance: number; dailyLimit: number | null; price: number; msUntilReset: number }> {
  await applyDailyGrant(userId);

  const price = await getGlobalMessagePrice();
  const baseDailyGrant = await getGlobalDailyCoinGrant();
  const garagePerk = await getActiveGaragePerk(userId);
  // Same composition as checkAndReserveCoins above — see the note there.
  const subscription = await getActiveSubscription(userId);
  const dailyGrant = Math.max(
    baseDailyGrant + garagePerk.chatDailyBonus,
    subscription?.coinDailyFloor ?? 0
  );
  const msUntilReset = msUntilNextBakuDayStart();
  const { data, error } = await createAdminClient()
    .from('user_coins')
    .select('balance, daily_limit')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    void logError('chat.coins.balanceStatus', error, { userId });
    console.error('[chat] coin balance status read failed:', error);
    // fail open, consistent with checkAndReserveCoins
    return { balance: dailyGrant, dailyLimit: null, price, msUntilReset };
  }
  if (!data) return { balance: dailyGrant, dailyLimit: null, price, msUntilReset };

  return {
    balance: data.balance,
    dailyLimit: data.daily_limit,
    price,
    msUntilReset,
  };
}
