import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Hardcoded TS default (not an env var) — this is a brand-new concept with
// no prior env var to preserve compatibility with, unlike
// CHAT_RATE_LIMIT_MAX_PER_DAY in lib/chat/rateLimit.ts.
const DEFAULT_MESSAGE_PRICE = 1;
const DEFAULT_DAILY_LIMIT = 10;

// Exported so app/api/admin/chat-meta/route.ts can read/write the same
// app_settings row without duplicating the key.
export const COIN_PRICE_SETTING_KEY = 'chat_message_price';
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

// Checks whether the user has enough balance to afford one message at the
// current global price, resetting/creating their user_coins row as needed,
// but does NOT decrement — see debitCoins below. Called before any
// conversation/message rows are created or any retrieval/LLM work starts, so
// a rejected request costs nothing.
export async function checkAndReserveCoins(
  userId: string,
): Promise<{ allowed: boolean; balance: number; dailyLimit: number | null; price: number; message: string | null }> {
  const price = await getGlobalMessagePrice();
  const { data, error } = await createAdminClient()
    .rpc('check_and_reserve_coins', {
      p_user_id: userId,
      p_price: price,
      p_default_daily_limit: DEFAULT_DAILY_LIMIT,
    })
    .single<ReserveCoinsResult>();

  if (error) {
    console.error('[chat] coin reservation check failed:', error);
    // fail open — infra hiccup shouldn't block chat, mirrors
    // checkChatRateLimit's fail-open behavior in lib/chat/rateLimit.ts.
    return { allowed: true, balance: 0, dailyLimit: null, price, message: null };
  }

  if (!data.allowed) {
    return {
      allowed: false,
      balance: data.balance,
      dailyLimit: data.daily_limit,
      price,
      message: 'Kifayət qədər coininiz yoxdur. Balansınız sabah bərpa olunacaq.',
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
    console.error('[chat] coin debit failed:', error);
    return null;
  }

  return typeof data === 'number' ? data : null;
}

// Read-only balance lookup for GET /api/chat/quota — deliberately bypasses
// check_and_reserve_coins (which inserts/locks/resets) and reads user_coins
// directly via the service-role client, same pattern as
// getChatQuotaStatus in lib/chat/rateLimit.ts. Reapplies the same "24h since
// last_reset_at -> raise balance to the floor if below it" rule the SQL
// function uses internally (greatest(balance, effectiveLimit), never
// lowers), without writing anything, so viewing the balance never itself
// triggers a reset a moment before the user's next real request would.
export async function getCoinBalanceStatus(
  userId: string,
): Promise<{ balance: number; dailyLimit: number | null; price: number }> {
  const price = await getGlobalMessagePrice();
  const { data, error } = await createAdminClient()
    .from('user_coins')
    .select('balance, daily_limit, last_reset_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[chat] coin balance status read failed:', error);
    return { balance: DEFAULT_DAILY_LIMIT, dailyLimit: null, price }; // fail open, consistent with checkAndReserveCoins
  }
  if (!data) return { balance: DEFAULT_DAILY_LIMIT, dailyLimit: null, price };

  const effectiveLimit = data.daily_limit ?? DEFAULT_DAILY_LIMIT;
  const lastResetAt = new Date(data.last_reset_at).getTime();
  const resetDue = (Date.now() - lastResetAt) / 1000 >= 86400;

  return {
    balance: resetDue ? Math.max(data.balance, effectiveLimit) : data.balance,
    dailyLimit: data.daily_limit,
    price,
  };
}
