import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_DAILY_LIMIT } from '@/lib/chat/coins';

// New home for Phase 1 of the coin roadmap (docs/coin-roadmap.md), not
// lib/chat/coins.ts — that file's fail-open posture is specific to chat
// message gating (an infra hiccup there should never block a chat request).
// Transfers are a deliberate financial action, so everything here is
// fail-CLOSED: any DB/RPC error returns { ok: false }, never assumes success.

const TRANSFER_MIN_AMOUNT_KEY = 'coin_transfer_min_amount';
const TRANSFER_DAILY_CAP_KEY = 'coin_transfer_daily_cap';

const DEFAULT_TRANSFER_MIN_AMOUNT = 1;
const DEFAULT_TRANSFER_DAILY_CAP = 20;

// 0059_security_hardening.sql section D.3. Transfers are the concentration
// step of the referral/quiz farming loop — many throwaway accounts funnelling
// coins into one real account. The pre-existing daily cap only counted
// sender_id, so the receiving side was completely unbounded, and there was no
// account-age requirement at all on the sender.
const TRANSFER_MIN_ACCOUNT_AGE_DAYS_KEY = 'coin_transfer_min_account_age_days';
const TRANSFER_DAILY_RECEIVE_CAP_KEY = 'coin_transfer_daily_receive_cap';

const DEFAULT_TRANSFER_MIN_ACCOUNT_AGE_DAYS = 7;
const DEFAULT_TRANSFER_DAILY_RECEIVE_CAP = 20;

export {
  TRANSFER_MIN_AMOUNT_KEY,
  TRANSFER_DAILY_CAP_KEY,
  DEFAULT_TRANSFER_MIN_AMOUNT,
  DEFAULT_TRANSFER_DAILY_CAP,
  TRANSFER_MIN_ACCOUNT_AGE_DAYS_KEY,
  TRANSFER_DAILY_RECEIVE_CAP_KEY,
  DEFAULT_TRANSFER_MIN_ACCOUNT_AGE_DAYS,
  DEFAULT_TRANSFER_DAILY_RECEIVE_CAP,
};

async function readNumericSetting(key: string, fallback: number): Promise<number> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();

  if (error || !data) return fallback;

  const value = typeof data.value === 'number' ? data.value : Number(data.value);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

// Mirrors getGlobalMessagePrice's shape (lib/chat/coins.ts): read the
// admin-configurable app_settings value, fall back to a hardcoded TS
// default when no row exists or the read errors.
export async function getTransferMinAmount(): Promise<number> {
  return readNumericSetting(TRANSFER_MIN_AMOUNT_KEY, DEFAULT_TRANSFER_MIN_AMOUNT);
}

export async function getTransferDailyCap(): Promise<number> {
  return readNumericSetting(TRANSFER_DAILY_CAP_KEY, DEFAULT_TRANSFER_DAILY_CAP);
}

export async function getTransferMinAccountAgeDays(): Promise<number> {
  const value = await readNumericSetting(
    TRANSFER_MIN_ACCOUNT_AGE_DAYS_KEY,
    DEFAULT_TRANSFER_MIN_ACCOUNT_AGE_DAYS
  );
  return Math.round(value);
}

export async function getTransferDailyReceiveCap(): Promise<number> {
  return readNumericSetting(TRANSFER_DAILY_RECEIVE_CAP_KEY, DEFAULT_TRANSFER_DAILY_RECEIVE_CAP);
}

// Looks up a recipient by email (profiles.email, populated from
// auth.users.email on signup — see 0001_init.sql's handle_new_user
// trigger), excluding the caller's own id so "transfer to myself" and
// "no such user" both come back as null from here. The caller (server
// action) is responsible for turning null into a single generic
// account-enumeration-safe message — this function's job is lookup only,
// it does not decide user-facing wording.
export async function lookupRecipientByEmail(
  email: string,
  excludeUserId: string
): Promise<{ id: string } | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id')
    .ilike('email', trimmed)
    .maybeSingle();

  if (error || !data) return null;
  if (data.id === excludeUserId) return null;

  return { id: data.id };
}

type TransferResult =
  | { ok: true; senderBalance: number; recipientBalance: number }
  | {
      ok: false;
      error:
        | 'self_transfer'
        | 'insufficient_balance'
        | 'daily_cap_exceeded'
        | 'recipient_daily_cap_exceeded'
        | 'account_too_new'
        | 'invalid_amount'
        | 'error';
    };

interface TransferCoinsRpcResult {
  sender_balance: number;
  recipient_balance: number;
}

// Calls transfer_coins (supabase/migrations/0041_coin_transfers.sql) via the
// service-role client. Never throws — always returns the discriminated
// union above. Error strings are short internal codes (NOT final
// Azerbaijani UI text) — the caller (app/account/actions.ts'
// transferCoins server action) maps these to user-facing Azerbaijani
// messages, so this function stays reusable if another surface ever needs
// transfers without that specific wording.
export async function transferCoins(
  senderId: string,
  recipientId: string,
  amount: number
): Promise<TransferResult> {
  const [dailyTransferCap, minAccountAgeDays, dailyReceiveCap] = await Promise.all([
    getTransferDailyCap(),
    getTransferMinAccountAgeDays(),
    getTransferDailyReceiveCap(),
  ]);

  const { data, error } = await createAdminClient()
    .rpc('transfer_coins', {
      p_sender_id: senderId,
      p_recipient_id: recipientId,
      p_amount: amount,
      p_default_daily_limit: DEFAULT_DAILY_LIMIT,
      p_daily_transfer_cap: dailyTransferCap,
      p_min_account_age_days: minAccountAgeDays,
      p_daily_receive_cap: dailyReceiveCap,
    })
    .single<TransferCoinsRpcResult>();

  if (error) {
    console.error('[coins] transfer_coins RPC failed:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });

    const message = error.message ?? '';
    if (message.includes('sender_equals_recipient')) return { ok: false, error: 'self_transfer' };
    if (message.includes('insufficient_transferable_balance')) return { ok: false, error: 'insufficient_balance' };
    if (message.includes('daily_transfer_cap_exceeded')) return { ok: false, error: 'daily_cap_exceeded' };
    if (message.includes('daily_receive_cap_exceeded')) return { ok: false, error: 'recipient_daily_cap_exceeded' };
    if (message.includes('sender_account_too_new')) return { ok: false, error: 'account_too_new' };
    if (message.includes('invalid_amount')) return { ok: false, error: 'invalid_amount' };
    return { ok: false, error: 'error' };
  }

  if (!data) return { ok: false, error: 'error' };

  return { ok: true, senderBalance: data.sender_balance, recipientBalance: data.recipient_balance };
}

export interface TransferRow {
  id: string;
  amount: number;
  createdAt: string;
  counterpartyId: string;
  counterpartyLabel: string;
}

interface CoinTransferSelectRow {
  id: string;
  amount: number;
  created_at: string;
  sender_id: string;
  recipient_id: string;
}

function labelForProfile(profile: { full_name: string | null; email: string | null } | null | undefined): string {
  if (!profile) return 'İstifadəçi';
  if (profile.full_name && profile.full_name.trim()) return profile.full_name.trim();
  if (profile.email) {
    const [local] = profile.email.split('@');
    return local ? `${local.slice(0, 3)}***` : 'İstifadəçi';
  }
  return 'İstifadəçi';
}

// Plain read, no RPC needed — reads coin_transfers directly via the
// service-role client (bypassing RLS is fine here since this always runs
// server-side scoped to the authenticated caller's own userId), then
// enriches each row with the counterparty's display name (profiles.full_name,
// falling back to a truncated email local-part, never the full email — a
// P2P transfer counterparty label doesn't need to leak the other user's
// full address).
export async function getTransferHistory(
  userId: string
): Promise<{ sent: TransferRow[]; received: TransferRow[] }> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('coin_transfers')
    .select('id, amount, created_at, sender_id, recipient_id')
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .returns<CoinTransferSelectRow[]>();

  if (error || !data) {
    console.error('[coins] getTransferHistory read failed:', error);
    return { sent: [], received: [] };
  }

  const counterpartyIds = Array.from(
    new Set(data.map((row) => (row.sender_id === userId ? row.recipient_id : row.sender_id)))
  );

  const { data: profiles } = counterpartyIds.length
    ? await admin.from('profiles').select('id, full_name, email').in('id', counterpartyIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const sent: TransferRow[] = [];
  const received: TransferRow[] = [];

  for (const row of data) {
    const isSender = row.sender_id === userId;
    const counterpartyId = isSender ? row.recipient_id : row.sender_id;
    const entry: TransferRow = {
      id: row.id,
      amount: row.amount,
      createdAt: row.created_at,
      counterpartyId,
      counterpartyLabel: labelForProfile(profileById.get(counterpartyId)),
    };
    if (isSender) sent.push(entry);
    else received.push(entry);
  }

  return { sent, received };
}
