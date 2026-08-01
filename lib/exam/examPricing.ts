import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Read-only view of the exam's entry cost, for pages that need to SHOW the
// price before the user commits (the /imtahan landing screen) and for the
// admin panel that edits it. The actual debit still happens inside
// start_exam_session's single atomic RPC — this never becomes the source of
// truth for what gets charged, so a stale read here can only ever mislabel a
// button, never mischarge anyone.
//
// exam_pass_threshold has no TS constant in examSession.ts on purpose (see
// 0082's trailing comment: "frontend badge only, NOT enforced here"), so its
// default lives here, at its only consumer.
const EXAM_PASS_THRESHOLD_KEY = 'exam_pass_threshold';
const DEFAULT_EXAM_PASS_THRESHOLD = 8;

export const EXAM_COIN_PRICE_KEY = 'exam_coin_price';

// 5, deliberately: the daily coin floor (daily_coin_grant) is 10, so a fresh
// account can sit the exam twice on its first day, while the price still costs
// 5x a chat message and is a meaningful sink for the premium currency. The
// owner tunes the live value from /admin/users; this is only the fallback.
export const DEFAULT_EXAM_COIN_PRICE = 5;

export interface ExamEntryPricing {
  coinPrice: number;
  passThreshold: number;
}

export async function getExamEntryPricing(): Promise<ExamEntryPricing> {
  const fallback: ExamEntryPricing = {
    coinPrice: DEFAULT_EXAM_COIN_PRICE,
    passThreshold: DEFAULT_EXAM_PASS_THRESHOLD,
  };

  // Display-only path — fails OPEN to the TS defaults, per the app-wide split
  // where read-only display degrades gracefully and only coin-SPENDING paths
  // fail closed.
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('key, value')
    .in('key', [EXAM_COIN_PRICE_KEY, EXAM_PASS_THRESHOLD_KEY]);

  if (error || !data) return fallback;

  // `allowZero` for the PRICE only: 0 is a legitimate admin choice (a free
  // exam). For the pass threshold 0 is not configuration, it is an unreadable
  // value, so it still falls back.
  const read = (key: string, defaultValue: number, allowZero: boolean): number => {
    const row = data.find((entry) => entry.key === key);
    if (!row) return defaultValue;
    const value = typeof row.value === 'number' ? row.value : Number(row.value);
    if (!Number.isFinite(value)) return defaultValue;
    return allowZero ? (value >= 0 ? value : defaultValue) : value > 0 ? value : defaultValue;
  };

  return {
    coinPrice: Math.round(read(EXAM_COIN_PRICE_KEY, DEFAULT_EXAM_COIN_PRICE, true)),
    passThreshold: Math.round(read(EXAM_PASS_THRESHOLD_KEY, DEFAULT_EXAM_PASS_THRESHOLD, false)),
  };
}
