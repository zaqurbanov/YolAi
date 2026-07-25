import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { RULE_CATEGORIES, type RuleCategory } from '@/lib/content/ruleCategories';

// Admin overrides for the category cards' text fields, keyed by the FIXED
// category title (titles themselves are not overridable — they're the join
// key). Same server-side app_settings read pattern as
// lib/content/homeBackground.ts: service-role client, fail open to the
// TS-side defaults in RULE_CATEGORIES on any error/missing row/bad JSON,
// because a broken admin override must never blank the public home page.
export const CATEGORY_OVERRIDES_SETTING_KEY = 'home_category_overrides';

export const OVERRIDABLE_CATEGORY_FIELDS = ['description', 'citation', 'question'] as const;
export type OverridableCategoryField = (typeof OVERRIDABLE_CATEGORY_FIELDS)[number];
export type CategoryOverrides = Record<string, Partial<Record<OverridableCategoryField, string>>>;

const CATEGORY_TITLES = new Set(RULE_CATEGORIES.map((c) => c.title));

// Tolerant-by-construction: only keeps well-formed { knownTitle: { knownField:
// nonEmptyString } } entries and silently drops the rest, so a hand-edited or
// stale app_settings row degrades to defaults instead of throwing.
export function parseCategoryOverrides(raw: unknown): CategoryOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

  const result: CategoryOverrides = {};
  for (const [title, fields] of Object.entries(raw)) {
    if (!CATEGORY_TITLES.has(title)) continue;
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;

    const entry: Partial<Record<OverridableCategoryField, string>> = {};
    for (const field of OVERRIDABLE_CATEGORY_FIELDS) {
      const value = (fields as Record<string, unknown>)[field];
      if (typeof value === 'string' && value.trim().length > 0) {
        entry[field] = value.trim();
      }
    }
    if (Object.keys(entry).length > 0) result[title] = entry;
  }
  return result;
}

export async function getCategoryOverrides(): Promise<CategoryOverrides> {
  try {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', CATEGORY_OVERRIDES_SETTING_KEY)
      .maybeSingle();

    if (error) return {};
    return parseCategoryOverrides(data?.value);
  } catch {
    return {};
  }
}

export async function getCategoryContent(): Promise<RuleCategory[]> {
  const overrides = await getCategoryOverrides();
  return RULE_CATEGORIES.map((category) => ({
    ...category,
    ...overrides[category.title],
  }));
}

// Published-question counts per category for the cards' badges. Fetches just
// the category column and counts in-process — the question bank is a few
// hundred rows at most, not worth a bespoke SQL aggregate. Read-only display
// data, so it fails OPEN to {} (missing badge, not a broken page).
export async function getCategoryQuestionCounts(): Promise<Record<string, number>> {
  try {
    const { data, error } = await createAdminClient()
      .from('quiz_questions')
      .select('category')
      .eq('status', 'published');

    if (error || !data) return {};

    const counts: Record<string, number> = {};
    for (const row of data) {
      if (typeof row.category !== 'string') continue;
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
    return counts;
  } catch {
    return {};
  }
}
