import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { EXAM_ENERGY_COST_KEY, DEFAULT_EXAM_ENERGY_COST } from '@/lib/exam/examSession';

// Read-only view of the exam's entry cost, for pages that need to SHOW the
// price before the user commits (the /imtahan landing screen). The actual
// debit still happens inside start_exam_session's single atomic RPC — this
// never becomes the source of truth for what gets charged, so a stale read
// here can only ever mislabel a button, never mischarge anyone.
//
// exam_pass_threshold has no TS constant in examSession.ts on purpose (see
// 0082's trailing comment: "frontend badge only, NOT enforced here"), so its
// default lives here, at its only consumer.
const EXAM_PASS_THRESHOLD_KEY = 'exam_pass_threshold';
const DEFAULT_EXAM_PASS_THRESHOLD = 8;

// coinPrice was removed in 0094_two_currency_economy.sql — the exam has no
// coin entry path at all any more, so there is no coin price to display.
export interface ExamEntryPricing {
  energyCost: number;
  passThreshold: number;
}

export async function getExamEntryPricing(): Promise<ExamEntryPricing> {
  const fallback: ExamEntryPricing = {
    energyCost: DEFAULT_EXAM_ENERGY_COST,
    passThreshold: DEFAULT_EXAM_PASS_THRESHOLD,
  };

  // Display-only path — fails OPEN to the TS defaults, per the app-wide split
  // where read-only display degrades gracefully and only coin-GRANTING paths
  // fail closed.
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('key, value')
    .in('key', [EXAM_ENERGY_COST_KEY, EXAM_PASS_THRESHOLD_KEY]);

  if (error || !data) return fallback;

  const read = (key: string, defaultValue: number): number => {
    const row = data.find((entry) => entry.key === key);
    if (!row) return defaultValue;
    const value = typeof row.value === 'number' ? row.value : Number(row.value);
    return Number.isFinite(value) && value > 0 ? value : defaultValue;
  };

  return {
    energyCost: Math.round(read(EXAM_ENERGY_COST_KEY, DEFAULT_EXAM_ENERGY_COST)),
    passThreshold: Math.round(read(EXAM_PASS_THRESHOLD_KEY, DEFAULT_EXAM_PASS_THRESHOLD)),
  };
}
