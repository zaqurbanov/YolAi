import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUserConversations } from '@/lib/admin/getUserDetail';
import { apiError, notFound, serverError, logApiError } from '@/lib/api/errors';
import { getChatModelId } from '@/lib/llm';
import { ingestDocument, reprocessDocument } from '@/lib/ingestion/ingestDocument';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';
import { isStaleProcessing } from '@/lib/ingestion/staleness';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { generateQuestionsFromPdf } from '@/lib/quiz/generateQuestionsFromPdf';
import { createDraftQuestions } from '@/lib/admin/quizQuestions';
import {
  getUnreadCount,
  getRecentNotifications,
  ensureDailyQuestReminderNotification,
} from '@/lib/notifications/notifications';
import { GLOBAL_DEFAULT_SETTING_KEY, ENV_DEFAULT_MAX_PER_WINDOW } from '@/lib/chat/rateLimit';
import {
  DAILY_LLM_MESSAGE_CAP_KEY,
  DEFAULT_DAILY_LLM_MESSAGE_CAP,
  readGlobalLlmUsageToday,
} from '@/lib/chat/globalLimit';
import {
  COIN_PRICE_SETTING_KEY,
  DEFAULT_MESSAGE_PRICE,
  DAILY_COIN_GRANT_SETTING_KEY,
  DEFAULT_DAILY_LIMIT,
} from '@/lib/chat/coins';
import {
  COURSE_UNLOCK_PRICE_KEY,
  DEFAULT_COURSE_UNLOCK_PRICE,
  PASS_THRESHOLD_KEY,
  DEFAULT_PASS_THRESHOLD,
  QUESTIONS_PER_ATTEMPT_KEY,
  DEFAULT_QUESTIONS_PER_ATTEMPT,
  RETRY_COST_KEY,
  DEFAULT_RETRY_COST,
} from '@/lib/coins/lessonUnlock';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';
import {
  CATEGORY_OVERRIDES_SETTING_KEY,
  OVERRIDABLE_CATEGORY_FIELDS,
  parseCategoryOverrides,
  type CategoryOverrides,
  type OverridableCategoryField,
} from '@/lib/content/categoryContent';
import {
  AD_WATCH_REWARD_KEY,
  DEFAULT_AD_WATCH_REWARD,
  AD_WATCH_DAILY_MAX_KEY,
  DEFAULT_AD_WATCH_DAILY_MAX,
  AD_VIEW_DURATION_KEY,
  DEFAULT_AD_VIEW_DURATION_SECONDS,
  MAX_AD_VIEW_DURATION_SECONDS,
} from '@/lib/coins/adWatch';
import {
  ENERGY_PURCHASE_COIN_COST_KEY,
  DEFAULT_ENERGY_PURCHASE_COIN_COST,
  ENERGY_PURCHASE_ENERGY_AMOUNT_KEY,
  DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT,
  ENERGY_PURCHASE_MAX_BALANCE_KEY,
  DEFAULT_ENERGY_PURCHASE_MAX_BALANCE,
  ENERGY_PURCHASE_MAX_MULTIPLIER_KEY,
  DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER,
  TICTACTOE_WIN_REWARD_KEY,
  DEFAULT_TICTACTOE_WIN_REWARD,
  GAME_DAILY_ENERGY_KEY,
  DEFAULT_GAME_DAILY_ENERGY,
  GAME_ENERGY_COST_KEY,
  DEFAULT_GAME_ENERGY_COST,
  TICTACTOE_DAILY_WIN_CAP_KEY,
  DEFAULT_TICTACTOE_DAILY_WIN_CAP,
} from '@/lib/coins/games';
import {
  ENERGY_TO_COIN_ENERGY_UNIT_KEY,
  DEFAULT_ENERGY_TO_COIN_ENERGY_UNIT,
  ENERGY_TO_COIN_COIN_RATE_KEY,
  DEFAULT_ENERGY_TO_COIN_COIN_RATE,
  ENERGY_TO_COIN_DAILY_CAP_KEY,
  DEFAULT_ENERGY_TO_COIN_DAILY_CAP,
} from '@/lib/coins/energyToCoin';
import { EXAM_COIN_PRICE_KEY, DEFAULT_EXAM_COIN_PRICE } from '@/lib/exam/examPricing';
import { DAILY_CHEST_REWARD_KEY, DEFAULT_DAILY_CHEST_REWARD } from '@/lib/coins/dailyQuests';
import { QUIZ_REWARD_KEY, DEFAULT_QUIZ_REWARD } from '@/lib/coins/quiz';
import {
  SIGN_SPEED_PER_CORRECT_REWARD_KEY,
  DEFAULT_SIGN_SPEED_PER_CORRECT_REWARD,
  SIGN_SPEED_DAILY_REWARD_CAP_KEY,
  DEFAULT_SIGN_SPEED_DAILY_REWARD_CAP,
  SIGN_SPEED_ENERGY_COST_KEY,
  DEFAULT_SIGN_SPEED_ENERGY_COST,
} from '@/lib/coins/signSpeed';
import type { CarTier } from '@/lib/garage/carTiers';
import {
  GARAGE_XO_BONUS_PCT_KEY,
  DEFAULT_GARAGE_XO_BONUS_PCT,
  GARAGE_ENERGY_BONUS_KEY,
  DEFAULT_GARAGE_ENERGY_BONUS,
  GARAGE_CHAT_BONUS_KEY,
  DEFAULT_GARAGE_CHAT_BONUS,
} from '@/lib/garage/perks';
import { VIP_PLATE_PRICE_KEY, DEFAULT_VIP_PLATE_PRICE } from '@/lib/garage/plates';
import { WHEEL_PRIZES_KEY, getWheelPrizes, type WheelPrize } from '@/lib/coins/wheel';
import {
  WEEKLY_MARATHON_REWARDS_KEY,
  DEFAULT_WEEKLY_MARATHON_SCHEDULE,
  DAILY_MISSION_REWARD_KEY,
  DEFAULT_DAILY_MISSION_REWARD,
  type WeeklyMarathonSlot,
} from '@/lib/coins/weeklyMarathon';
import { bakuTodayDate } from '@/lib/date/baku';

// Inherited from the folded-in documents/quiz-questions routes: PDF ingestion
// and LLM question extraction over a full PDF are both slow. This applies to
// the whole file, so the cheap settings branches share it — harmless, since
// maxDuration is a ceiling, not a reservation.
export const maxDuration = 300;

const HOME_BACKGROUND_SETTING_KEY = 'home_background_image_url';
const SITE_LOGO_SETTING_KEY = 'site_logo_url';
const PUBLIC_ASSETS_BUCKET = 'public-assets';

// Storage keys must be ASCII-safe; Azerbaijani/Cyrillic/accented filenames
// (e.g. "778-IQ - Avtomobil yolları haqqında.pdf") make Supabase Storage
// reject the key with "Invalid key". The original name is preserved
// separately in documents.title, so it's safe to slug it here.
function slugifyAssetFilename(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  const slugBase = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  const slugExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

  return slugExt ? `${slugBase || 'file'}.${slugExt}` : slugBase || 'file';
}

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — same
// convention as app/api/admin/users/[id]/rate-limit/route.ts.
const MAX_ALLOWED = 100000;

// Coin price is numeric(10,2) and explicitly allowed to be fractional (e.g.
// 0.5/message) — bounds chosen to reject fat-fingered values while still
// allowing sub-1 prices, unlike MAX_ALLOWED above which is integer-only.
const MAX_ALLOWED_PRICE = 10000;

// Chunk-listing pagination for `?type=documents&id=...&chunks=1`.
const DEFAULT_CHUNK_PAGE_SIZE = 25;
const MAX_CHUNK_PAGE_SIZE = 100;

const DEFAULT_USER_CONVERSATIONS_LIMIT = 10;
const MAX_USER_CONVERSATIONS_LIMIT = 50;

// Only the two real role tiers are assignable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

// Coin values are numeric(10,2) and explicitly allowed to be fractional
// (e.g. 0.5 grant) — bounds chosen only to reject fat-fingered input.
const MAX_ALLOWED_DAILY_COIN_LIMIT = 100000;
const MAX_ALLOWED_COIN_GRANT = 100000;
const MAX_ALLOWED_ENERGY_GRANT = 100000;

// Daily chest reward is a per-quest-completion coin amount, not a daily
// aggregate limit — a much lower sane ceiling than MAX_ALLOWED applies.
const MAX_ALLOWED_CHEST_REWARD = 1000;

// Weekly-marathon slot reward is a per-day chest payout, not an aggregate —
// same rationale as MAX_ALLOWED_CHEST_REWARD above.
const MAX_ALLOWED_MARATHON_REWARD = 1000;

// Daily quiz reward is a per-answer coin amount, not an aggregate — same
// rationale as MAX_ALLOWED_CHEST_REWARD above.
const MAX_ALLOWED_QUIZ_REWARD = 1000;

// The lesson/ad economy tunables, exposed through one `?type=lesson-economy`
// branch rather than one type discriminator each — the Vercel Hobby
// serverless-function budget (see CLAUDE.md) rules out new route files, and
// these are always edited together on one admin screen.
//
// Retargeted to the COURSE model (0060_lesson_courses.sql). The old
// category-era keys (lesson_category_unlock_price, lesson_completion_bonus,
// lesson_free_category_count) are no longer read anywhere; a stale row for one
// of them in a deployed environment is inert.
//
// `param` is the request/response key the frontend uses; `key` is the
// app_settings row. Bounds are enforced HERE, server-side — the admin UI's
// input constraints are a convenience, not a validation.
const LESSON_ECONOMY_FIELDS = [
  {
    // The GLOBAL default course price. A lesson_courses.unlock_price override
    // wins over this per course, and is edited on the course itself.
    param: 'courseUnlockPrice',
    key: COURSE_UNLOCK_PRICE_KEY,
    defaultValue: DEFAULT_COURSE_UNLOCK_PRICE,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    // Correct answers required to pass a topic test. Nothing here stops it
    // being set above questionsPerAttempt (the two are separate writes);
    // getTopicTestConfig() clamps at READ time so a bad combination can't
    // make every topic unpassable.
    param: 'topicPassThreshold',
    key: PASS_THRESHOLD_KEY,
    defaultValue: DEFAULT_PASS_THRESHOLD,
    integerOnly: true,
    min: 1,
    max: 100,
  },
  {
    // Questions drawn per attempt from the topic's 15-20 question pool.
    param: 'topicQuestionsPerAttempt',
    key: QUESTIONS_PER_ATTEMPT_KEY,
    defaultValue: DEFAULT_QUESTIONS_PER_ATTEMPT,
    integerOnly: true,
    min: 1,
    max: 100,
  },
  {
    param: 'lessonRetryCost',
    key: RETRY_COST_KEY,
    defaultValue: DEFAULT_RETRY_COST,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'adWatchReward',
    key: AD_WATCH_REWARD_KEY,
    defaultValue: DEFAULT_AD_WATCH_REWARD,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'adWatchDailyMax',
    key: AD_WATCH_DAILY_MAX_KEY,
    defaultValue: DEFAULT_AD_WATCH_DAILY_MAX,
    integerOnly: true,
    min: 1,
    max: 1000,
  },
  {
    // Seconds the ad must be watched. Drives BOTH the server's minimum-elapsed
    // token check (getAdViewDurationSeconds -> consume_ad_view_token) and the
    // client countdown in AdWatchCard - one setting, one source of truth.
    param: 'adViewDurationSeconds',
    key: AD_VIEW_DURATION_KEY,
    defaultValue: DEFAULT_AD_VIEW_DURATION_SECONDS,
    integerOnly: true,
    min: 1,
    max: MAX_AD_VIEW_DURATION_SECONDS,
  },
] as const;

const LESSON_ECONOMY_KEYS = LESSON_ECONOMY_FIELDS.map((f) => f.key);

// Generic over any {integerOnly, min, max} field shape so it also serves
// ENERGY_ECONOMY_FIELDS below without a near-duplicate validator.
function isValidLessonEconomyValue(
  field: { integerOnly: boolean; min: number; max: number },
  value: number
): boolean {
  if (!Number.isFinite(value)) return false;
  if (field.integerOnly && !Number.isInteger(value)) return false;
  return value >= field.min && value <= field.max;
}

// The "buy energy with coins" tunables (0072_energy_purchase.sql), exposed
// through their own `?type=energy-economy` group — a separate economy family
// from LESSON_ECONOMY_FIELDS above (energy purchase, not lessons), edited on
// its own admin screen, but sharing the same field/validation/response shape.
const ENERGY_ECONOMY_FIELDS = [
  {
    param: 'energyPurchaseCoinCost',
    key: ENERGY_PURCHASE_COIN_COST_KEY,
    defaultValue: DEFAULT_ENERGY_PURCHASE_COIN_COST,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'energyPurchaseEnergyAmount',
    key: ENERGY_PURCHASE_ENERGY_AMOUNT_KEY,
    defaultValue: DEFAULT_ENERGY_PURCHASE_ENERGY_AMOUNT,
    integerOnly: true,
    min: 1,
    max: 1000,
  },
  {
    param: 'energyPurchaseMaxBalance',
    key: ENERGY_PURCHASE_MAX_BALANCE_KEY,
    defaultValue: DEFAULT_ENERGY_PURCHASE_MAX_BALANCE,
    integerOnly: true,
    min: 1,
    max: 100000,
  },
  {
    param: 'energyPurchaseMaxMultiplier',
    key: ENERGY_PURCHASE_MAX_MULTIPLIER_KEY,
    defaultValue: DEFAULT_ENERGY_PURCHASE_MAX_MULTIPLIER,
    integerOnly: true,
    min: 1,
    max: 100,
  },
] as const;

const ENERGY_ECONOMY_KEYS = ENERGY_ECONOMY_FIELDS.map((f) => f.key);

// The energy -> COIN conversion tunables (0096_energy_to_coin.sql), exposed
// through their own `?type=energy-to-coin` group — same field/validation/response
// shape as the groups above. These are the ONLY three numbers that control the
// single owner-sanctioned energy->coin path; the daily cap is the real bound
// against the free-account abuse model (see the migration's header).
const ENERGY_TO_COIN_FIELDS = [
  {
    param: 'energyUnit',
    key: ENERGY_TO_COIN_ENERGY_UNIT_KEY,
    defaultValue: DEFAULT_ENERGY_TO_COIN_ENERGY_UNIT,
    integerOnly: true,
    min: 1,
    max: 10000,
  },
  {
    param: 'coinRate',
    key: ENERGY_TO_COIN_COIN_RATE_KEY,
    defaultValue: DEFAULT_ENERGY_TO_COIN_COIN_RATE,
    integerOnly: false,
    min: 0.01,
    max: 1000,
  },
  {
    param: 'dailyCap',
    key: ENERGY_TO_COIN_DAILY_CAP_KEY,
    defaultValue: DEFAULT_ENERGY_TO_COIN_DAILY_CAP,
    integerOnly: true,
    min: 1,
    max: 10000,
  },
] as const;

const ENERGY_TO_COIN_KEYS = ENERGY_TO_COIN_FIELDS.map((f) => f.key);

// Per-game coin rewards, exposed through their own `?type=game-rewards`
// group — the XO (tic-tac-toe) win reward and the Nişan Sürəti per-correct
// reward are edited together on one games-economy admin screen, same
// shared field/validation/response shape as LESSON_ECONOMY_FIELDS above.
const GAME_REWARD_FIELDS = [
  {
    param: 'tictactoeWinReward',
    key: TICTACTOE_WIN_REWARD_KEY,
    defaultValue: DEFAULT_TICTACTOE_WIN_REWARD,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
  {
    param: 'signSpeedPerCorrectReward',
    key: SIGN_SPEED_PER_CORRECT_REWARD_KEY,
    defaultValue: DEFAULT_SIGN_SPEED_PER_CORRECT_REWARD,
    integerOnly: false,
    min: 0.01,
    max: MAX_ALLOWED_PRICE,
  },
] as const;

const GAME_REWARD_KEYS = GAME_REWARD_FIELDS.map((f) => f.key);

// The energy FLOOR / per-day CAPS / round PRICES that previously had no admin
// surface at all (SQL-only), exposed through their own `?type=energy-tuning`
// group — same field/validation/response shape as the groups above.
//
// energyPurchaseMaxBalance is deliberately NOT duplicated here: it already
// lives in `?type=energy-economy`, and two writers for one app_settings key
// would let the admin UI show two different "current" values.
//
// The three PRICE fields allow min 0 — free play / free exam entry is a real
// configuration the owner may want, and lib/coins/games.ts +
// lib/coins/signSpeed.ts now read prices with allowZero so the stored 0 is
// honoured instead of silently falling back to 1. The floor/cap fields keep
// min 1, where 0 would just disable the feature by accident.
const ENERGY_TUNING_FIELDS = [
  {
    param: 'gameDailyEnergy',
    key: GAME_DAILY_ENERGY_KEY,
    defaultValue: DEFAULT_GAME_DAILY_ENERGY,
    integerOnly: true,
    min: 1,
    max: 100000,
  },
  {
    param: 'gameEnergyCost',
    key: GAME_ENERGY_COST_KEY,
    defaultValue: DEFAULT_GAME_ENERGY_COST,
    integerOnly: false,
    min: 0,
    max: 1000,
  },
  {
    param: 'tictactoeDailyWinCap',
    key: TICTACTOE_DAILY_WIN_CAP_KEY,
    defaultValue: DEFAULT_TICTACTOE_DAILY_WIN_CAP,
    integerOnly: true,
    min: 1,
    max: 1000,
  },
  {
    param: 'signSpeedEnergyCost',
    key: SIGN_SPEED_ENERGY_COST_KEY,
    defaultValue: DEFAULT_SIGN_SPEED_ENERGY_COST,
    integerOnly: true,
    min: 0,
    max: 1000,
  },
  {
    param: 'signSpeedDailyRewardCap',
    key: SIGN_SPEED_DAILY_REWARD_CAP_KEY,
    defaultValue: DEFAULT_SIGN_SPEED_DAILY_REWARD_CAP,
    integerOnly: false,
    min: 1,
    max: MAX_ALLOWED_PRICE,
  },
  {
    // COIN, not energy — the exam is the premium currency's third sink.
    param: 'examCoinPrice',
    key: EXAM_COIN_PRICE_KEY,
    defaultValue: DEFAULT_EXAM_COIN_PRICE,
    integerOnly: false,
    min: 0,
    max: MAX_ALLOWED_PRICE,
  },
] as const;

const ENERGY_TUNING_KEYS = ENERGY_TUNING_FIELDS.map((f) => f.key);

// Virtual Qaraj Phase 2 (Mərhələ 2) per-tier perk tunables, exposed through
// their own `?type=garage-perks` group — same shared field/validation/response
// shape as GAME_REWARD_FIELDS above. Not cumulative: only the currently-owned
// tier's perk applies (see lib/garage/perks.ts).
const GARAGE_PERK_FIELDS = [
  {
    param: 'garageXoBonusPct',
    key: GARAGE_XO_BONUS_PCT_KEY,
    defaultValue: DEFAULT_GARAGE_XO_BONUS_PCT,
    integerOnly: false,
    min: 0,
    max: 1000,
  },
  {
    param: 'garageEnergyBonus',
    key: GARAGE_ENERGY_BONUS_KEY,
    defaultValue: DEFAULT_GARAGE_ENERGY_BONUS,
    integerOnly: true,
    min: 0,
    max: 1000,
  },
  {
    param: 'garageChatDailyBonus',
    key: GARAGE_CHAT_BONUS_KEY,
    defaultValue: DEFAULT_GARAGE_CHAT_BONUS,
    integerOnly: true,
    min: 0,
    max: 1000,
  },
] as const;

const GARAGE_PERK_KEYS = GARAGE_PERK_FIELDS.map((f) => f.key);

// Category-card override text fields (`?type=category-content`). 300 chars is
// a card-copy bound, not a technical one — these render inside fixed-size
// cards on the home page.
const MAX_CATEGORY_FIELD_LENGTH = 300;

const VALID_CATEGORY_TITLES = new Set(RULE_CATEGORIES.map((c) => c.title));

// Same per-field value/source convention as lesson-economy, keyed under the
// FIXED category title so the admin UI can show "default" vs "overridden"
// per text field.
function buildCategoryContentResponse(overrides: CategoryOverrides) {
  return {
    categories: RULE_CATEGORIES.map((category) => {
      const entry = overrides[category.title] ?? {};
      return {
        title: category.title,
        ...Object.fromEntries(
          OVERRIDABLE_CATEGORY_FIELDS.map((field) => {
            const override = entry[field];
            return [
              field,
              override !== undefined
                ? { value: override, source: 'table' }
                : { value: category[field], source: 'default' },
            ];
          })
        ),
      };
    }),
  };
}

const BUSY_PHRASE_STAGES = ['analyzing', 'rewriting', 'searching', 'finalizing', 'streaming'] as const;
type BusyPhraseStage = (typeof BUSY_PHRASE_STAGES)[number];

function isBusyPhraseStage(value: unknown): value is BusyPhraseStage {
  return typeof value === 'string' && (BUSY_PHRASE_STAGES as readonly string[]).includes(value);
}

// Weekly-marathon schedule validation — all-or-nothing: exactly 7 slots, each
// with type ∈ {'energy','coins'} and a finite amount > 0. A single bad entry
// invalidates the WHOLE schedule (the claim path falls back to the TS default,
// so a partially-bad table value must never be half-applied). Mirrors
// lib/coins/weeklyMarathon.ts's rule.
function isValidWeeklyMarathonSchedule(value: unknown): value is WeeklyMarathonSlot[] {
  if (!Array.isArray(value) || value.length !== 7) return false;
  return value.every((entry) => {
    if (typeof entry !== 'object' || entry === null) return false;
    const type = (entry as Record<string, unknown>).type;
    const amount = (entry as Record<string, unknown>).amount;
    return (type === 'energy' || type === 'coins') && typeof amount === 'number' && Number.isFinite(amount) && amount > 0;
  });
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // busy-phrases must be readable by any authenticated user (the chat page
  // itself fetches these, not just admins) — so this branch is handled
  // before the requireAdmin() gate below, via the user-scoped client so
  // normal RLS (chat_busy_phrases_select_authenticated, 0046) governs access.
  if (type === 'busy-phrases') {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('chat_busy_phrases')
      .select('id, stage, phrase, display_order')
      .order('stage', { ascending: true })
      .order('display_order', { ascending: true });

    if (error) return serverError(error, 'Status cümlələrini yükləmək uğursuz oldu');

    return NextResponse.json({ phrases: data ?? [] });
  }

  // Like busy-phrases above, this must be readable by anyone hitting the
  // public home page, not just admins — handled before the requireAdmin()
  // gate. app_settings has no anon-readable RLS policy (0024), so this uses
  // the service-role client the same way rate-limit/coin-price/
  // daily-coin-grant do below, just without the admin gate first.
  if (type === 'background-image') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', HOME_BACKGROUND_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const url = typeof data?.value === 'string' ? data.value : null;
    return NextResponse.json({ url });
  }

  // Same public, no-admin-gate rationale as background-image above — the
  // site logo is rendered in NavBar/Sidebar for all visitors, not just admins.
  if (type === 'logo') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', SITE_LOGO_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const url = typeof data?.value === 'string' ? data.value : null;
    return NextResponse.json({ url });
  }

  // Everything NavBar/Sidebar used to read server-side, in one public,
  // no-admin-gate branch. Those two are client components now (so the ROOT
  // layout no longer calls cookies() and auth-free pages can render static —
  // see components/useNavState.ts); this exists instead of a new
  // app/api/nav-state/route.ts because the Vercel Hobby function budget in
  // CLAUDE.md rules out new route files. Rendering-only data: the real admin
  // gate is still requireAdmin() on the admin routes/pages themselves.
  if (type === 'nav-state') {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const { data: logoRow } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', SITE_LOGO_SETTING_KEY)
      .maybeSingle();
    const logoUrl = typeof logoRow?.value === 'string' ? logoRow.value : null;

    if (!user) {
      return NextResponse.json({ user: null, isAdmin: false, logoUrl, unreadCount: 0, notifications: [] });
    }

    await ensureDailyQuestReminderNotification(user.id);

    const [{ data: profile }, unreadCount, notifications] = await Promise.all([
      supabase.from('profiles').select('role, full_name, avatar_url').eq('id', user.id).single(),
      getUnreadCount(user.id),
      getRecentNotifications(user.id),
    ]);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email ?? null,
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      },
      isAdmin: profile?.role === 'admin',
      logoUrl,
      unreadCount,
      notifications,
    });
  }

  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  if (type === 'model') {
    return NextResponse.json({ modelId: getChatModelId() });
  }

  // Folded in from app/api/admin/documents/route.ts (Vercel Hobby function
  // budget, see CLAUDE.md). Service-role client, legitimate only because
  // requireAdmin() above has already gated this handler.
  if (type === 'documents') {
    const id = searchParams.get('id');
    const supabase = createAdminClient();

    if (id) {
      if (searchParams.get('chunks') === '1') {
        const { data: document, error: fetchError } = await supabase
          .from('documents')
          .select('id')
          .eq('id', id)
          .single();
        if (fetchError || !document) {
          return notFound('Sənəd tapılmadı');
        }

        const page = Math.max(1, Number(searchParams.get('page')) || 1);
        const pageSize = Math.min(
          MAX_CHUNK_PAGE_SIZE,
          Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_CHUNK_PAGE_SIZE)
        );
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const {
          data: chunks,
          error,
          count,
        } = await supabase
          .from('chunks')
          .select('id, content, page_number, article_label, chunk_index', { count: 'exact' })
          .eq('document_id', id)
          .order('chunk_index', { ascending: true })
          .range(from, to);

        if (error) return serverError(error, 'Chunk-ları yükləmək uğursuz oldu');

        return NextResponse.json({ chunks, total: count ?? 0, page, pageSize });
      }

      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('id, title, status, page_count, error_message, created_at, updated_at')
        .eq('id', id)
        .single();
      if (fetchError || !document) {
        return notFound('Sənəd tapılmadı');
      }
      const documentWithStale = { ...document, stale: isStaleProcessing(document.status, document.updated_at) };

      // Pull content length + article_label per chunk (not the embedding column,
      // which is large and unused here) to derive split-strategy stats in-process
      // rather than adding a bespoke SQL aggregate for a one-off admin view.
      const { data: chunkRows, error: chunksError } = await supabase
        .from('chunks')
        .select('content, article_label')
        .eq('document_id', id);
      if (chunksError) return serverError(chunksError, 'Chunk statistikasını yükləmək uğursuz oldu');

      const total = chunkRows.length;
      let minLength = 0;
      let maxLength = 0;
      let avgLength = 0;
      let markerBased = 0;
      let fallback = 0;

      if (total > 0) {
        const lengths = chunkRows.map((c) => c.content?.length ?? 0);
        minLength = Math.min(...lengths);
        maxLength = Math.max(...lengths);
        avgLength = Math.round(lengths.reduce((sum, len) => sum + len, 0) / total);
        for (const c of chunkRows) {
          if (c.article_label !== null) markerBased += 1;
          else fallback += 1;
        }
      }

      return NextResponse.json({
        document: documentWithStale,
        chunkStats: { total, minLength, maxLength, avgLength, markerBased, fallback },
      });
    }

    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) return serverError(error, 'Sənədləri yükləmək uğursuz oldu');
    const documents = data.map((doc) => ({
      ...doc,
      stale: isStaleProcessing(doc.status, doc.updated_at),
    }));
    return NextResponse.json({ documents });
  }

  if (type === 'user') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const limit = Math.min(
      MAX_USER_CONVERSATIONS_LIMIT,
      Math.max(1, Number(searchParams.get('limit')) || DEFAULT_USER_CONVERSATIONS_LIMIT)
    );
    const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

    try {
      const page = await getAdminUserConversations(id, { limit, offset });
      return NextResponse.json(page);
    } catch (error) {
      return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu', 'admin.chatMeta.userConversations');
    }
  }

  if (type === 'log') {
    const messageId = searchParams.get('messageId');
    if (!messageId) return apiError(400, 'messageId parametri tələb olunur');

    // User-scoped client, not createAdminClient() — the existing
    // chat_request_logs_select_admin RLS policy (0007) already permits admin
    // SELECT, so service-role is unnecessary here on top of requireAdmin().
    const supabase = await createClient();

    const { data, error } = await supabase
      .from('chat_request_logs')
      .select(
        'rewrite_ms, embed_ms, db_search_ms, llm_first_token_ms, llm_total_ms, used_fallback, model_used, created_at, prompt_tokens, completion_tokens, total_tokens',
      )
      .eq('message_id', messageId)
      .maybeSingle();

    if (error) return serverError(error, 'Vaxt ölçmələrini yükləmək uğursuz oldu');

    // No matching row is an expected, non-error case (messages created before
    // this feature shipped, or a best-effort log insert that failed) — return
    // 200 with `log: null` rather than 404, so the frontend doesn't need to
    // special-case a "missing resource" status for what's normal, not broken.
    return NextResponse.json({ log: data ?? null });
  }

  if (type === 'rate-limit') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', GLOBAL_DEFAULT_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      maxPerDay: isTableConfigured ? tableValue : ENV_DEFAULT_MAX_PER_WINDOW,
      source: isTableConfigured ? 'table' : 'env',
    });
  }

  // Global daily LLM circuit breaker (0093). Read-only: readGlobalLlmUsageToday
  // calls the non-incrementing peek RPC, so refreshing this panel can never
  // consume budget.
  if (type === 'llm-circuit-breaker') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', DAILY_LLM_MESSAGE_CAP_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    // `used` is null when the counter can't be read (most likely: 0093 not
    // applied yet) — surfaced as-is rather than coerced to 0, so the UI shows
    // "unknown" instead of a confidently wrong zero.
    const { used } = await readGlobalLlmUsageToday();

    return NextResponse.json({
      cap: isTableConfigured ? tableValue : DEFAULT_DAILY_LLM_MESSAGE_CAP,
      source: isTableConfigured ? 'table' : 'default',
      usedToday: used,
      date: bakuTodayDate(),
    });
  }

  if (type === 'coin-price') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', COIN_PRICE_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      price: isTableConfigured ? tableValue : DEFAULT_MESSAGE_PRICE,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'daily-coin-grant') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', DAILY_COIN_GRANT_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      dailyCoinGrant: isTableConfigured ? tableValue : DEFAULT_DAILY_LIMIT,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'daily-chest-reward') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', DAILY_CHEST_REWARD_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      dailyChestReward: isTableConfigured ? tableValue : DEFAULT_DAILY_CHEST_REWARD,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'daily-mission-reward') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', DAILY_MISSION_REWARD_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      dailyMissionReward: isTableConfigured ? tableValue : DEFAULT_DAILY_MISSION_REWARD,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'daily-quiz-reward') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', QUIZ_REWARD_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      dailyQuizReward: isTableConfigured ? tableValue : DEFAULT_QUIZ_REWARD,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  if (type === 'lesson-economy') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', LESSON_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    // One object per tunable so the frontend can show "default" vs
    // "admin-configured" per card, same `source` convention as coin-price /
    // daily-coin-grant above.
    const settings = Object.fromEntries(
      LESSON_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-economy') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      ENERGY_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-to-coin') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_TO_COIN_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    // Flat { energyUnit, coinRate, dailyCap } config (unlike the per-field
    // value/source objects the other groups return) plus a single source: the
    // frontend just needs the effective numbers and whether any is overridden.
    const config = Object.fromEntries(
      ENERGY_TO_COIN_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [field.param, isConfigured ? value : field.defaultValue];
      })
    ) as { energyUnit: number; coinRate: number; dailyCap: number };

    const source = ENERGY_TO_COIN_FIELDS.some((field) => {
      const raw = byKey.get(field.key);
      const value = raw === undefined || raw === null ? null : Number(raw);
      return value !== null && isValidLessonEconomyValue(field, value);
    })
      ? 'table'
      : 'default';

    return NextResponse.json({ config, source });
  }

  if (type === 'game-rewards') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', GAME_REWARD_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      GAME_REWARD_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-tuning') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_TUNING_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      ENERGY_TUNING_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'garage-perks') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('key, value')
      .in('key', GARAGE_PERK_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      GARAGE_PERK_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const value = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = value !== null && isValidLessonEconomyValue(field, value);
        return [
          field.param,
          {
            value: isConfigured ? value : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  // Virtual Qaraj (0083_virtual_garage.sql) — car_tiers is a small FIXED
  // catalog table, not an app_settings key-value tunable, so this reads/writes
  // the table directly rather than following the *_FIELDS pattern above.
  if (type === 'car-tiers') {
    const { data, error } = await createAdminClient()
      .from('car_tiers')
      .select('id, tier_order, name, emoji, coin_price')
      .order('tier_order', { ascending: true });

    if (error) return serverError(error, 'Avtomobil kateqoriyalarını yükləmək uğursuz oldu');

    const tiers: CarTier[] = (data ?? []).map((row) => ({
      id: row.id,
      tierOrder: row.tier_order,
      name: row.name,
      emoji: row.emoji,
      coinPrice: Number(row.coin_price),
    }));

    return NextResponse.json({ tiers });
  }

  if (type === 'category-content') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', CATEGORY_OVERRIDES_SETTING_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    return NextResponse.json(buildCategoryContentResponse(parseCategoryOverrides(data?.value)));
  }

  // Virtual Qaraj Mərhələ 3 (VIP Nömrə Bazarı, 0084_vip_plate_market.sql) —
  // single-field pattern, same shape as daily-chest-reward above.
  if (type === 'vip-plate-price') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', VIP_PLATE_PRICE_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const tableValue = data ? Number(data.value) : null;
    const isTableConfigured = tableValue !== null && Number.isFinite(tableValue) && tableValue > 0;

    return NextResponse.json({
      vipPlatePrice: isTableConfigured ? tableValue : DEFAULT_VIP_PLATE_PRICE,
      source: isTableConfigured ? 'table' : 'default',
    });
  }

  // Çarx (wheel of fortune) segment values + weights — reuses
  // getWheelPrizes() directly so the legacy-array backward-compat handling
  // isn't duplicated between the spin path and this admin read.
  if (type === 'wheel-prizes') {
    const prizes = await getWheelPrizes();
    return NextResponse.json({ prizes });
  }

  // Heftəlik marafon — the 7-slot chest schedule, STREAK-DAY-indexed since
  // 0097 (index 0 = streak day 1 .. index 6 = streak day 7 = COINS; no longer
  // weekday-anchored). Read directly (not just getWeeklyMarathonSchedule) so
  // we can report whether the table value is actually configured ('table') or
  // the TS default is in effect ('default') — same source convention as
  // daily-chest-reward above. Fail-open on an invalid shape: the default is
  // what the claim path will actually resolve, so showing it here is honest.
  if (type === 'weekly-marathon') {
    const { data, error } = await createAdminClient()
      .from('app_settings')
      .select('value')
      .eq('key', WEEKLY_MARATHON_REWARDS_KEY)
      .maybeSingle();

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const raw = data?.value;
    const isValid = isValidWeeklyMarathonSchedule(raw);
    return NextResponse.json({
      schedule: isValid ? (raw as WeeklyMarathonSlot[]) : DEFAULT_WEEKLY_MARATHON_SCHEDULE,
      source: isValid ? 'table' : 'default',
    });
  }

  // Moderation list of all custom (paid) plates, with the owning user's
  // email joined in a SECOND query (not a Postgrest join) — same two-query
  // pattern app/admin/logs/LogsSection.tsx uses for the same purpose.
  if (type === 'plate-moderation') {
    const admin = createAdminClient();

    const { data: plates, error } = await admin
      .from('license_plates')
      .select('plate_number, owner_id, price_paid, claimed_at')
      .eq('is_custom', true)
      .order('claimed_at', { ascending: false });

    if (error) {
      // Pre-migration state (0084 not yet applied) is expected and must
      // degrade to an empty moderation list, not a 500 — same posture as
      // getWeeklyLeaderboard/getCarEmojisByUserId's isMissingRelationError
      // fail-open handling.
      if (isMissingRelationError(error)) {
        return NextResponse.json({ plates: [] });
      }
      return serverError(error, 'Nömrələri yükləmək uğursuz oldu');
    }

    const ownerIds = Array.from(
      new Set((plates ?? []).map((p) => p.owner_id).filter((id): id is string => typeof id === 'string'))
    );

    const emailsByOwnerId = new Map<string, string>();
    if (ownerIds.length > 0) {
      const { data: profileRows } = await admin.from('profiles').select('id, email').in('id', ownerIds);
      for (const p of profileRows ?? []) {
        if (p.email) emailsByOwnerId.set(p.id, p.email);
      }
    }

    return NextResponse.json({
      plates: (plates ?? []).map((p) => ({
        plateNumber: p.plate_number,
        ownerId: p.owner_id,
        ownerEmail: p.owner_id ? emailsByOwnerId.get(p.owner_id) ?? null : null,
        pricePaid: Number(p.price_paid),
        claimedAt: p.claimed_at,
      })),
    });
  }

  return apiError(400, 'type parametri düzgün deyil');
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'background-image') {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (!file.type.startsWith('image/')) {
      return apiError(400, 'Yalnız şəkil faylları qəbul olunur');
    }

    const admin = createAdminClient();
    const storagePath = `home-background/${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from(PUBLIC_ASSETS_BUCKET)
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) return serverError(uploadError, 'Şəkli yükləmək uğursuz oldu');

    const {
      data: { publicUrl },
    } = admin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath);

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: HOME_BACKGROUND_SETTING_KEY, value: publicUrl, updated_at: new Date().toISOString() });
    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ url: publicUrl });
  }

  if (type === 'logo') {
    const formData = await request.formData().catch(() => null);
    const file = formData?.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (!file.type.startsWith('image/')) {
      return apiError(400, 'Yalnız şəkil faylları qəbul olunur');
    }

    const admin = createAdminClient();
    const storagePath = `logo/${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await admin.storage
      .from(PUBLIC_ASSETS_BUCKET)
      .upload(storagePath, file, { contentType: file.type });
    if (uploadError) return serverError(uploadError, 'Şəkli yükləmək uğursuz oldu');

    const {
      data: { publicUrl },
    } = admin.storage.from(PUBLIC_ASSETS_BUCKET).getPublicUrl(storagePath);

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: SITE_LOGO_SETTING_KEY, value: publicUrl, updated_at: new Date().toISOString() });
    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ url: publicUrl });
  }

  // Folded in from app/api/admin/documents/route.ts. Two POST shapes share
  // this branch, exactly as before: `?type=documents&id=...` reindexes an
  // existing document, `?type=documents` with no id is the multipart upload.
  if (type === 'documents') {
    const id = searchParams.get('id');

    if (id) {
      // Unlike ingest-on-upload, this is fully awaited before responding (not a
      // detached background job), so a failure here should be surfaced to the
      // caller rather than returning a false ok:true.
      try {
        await reprocessDocument(id);
      } catch (err) {
        return serverError(err, 'Sənədi yenidən emal etmək uğursuz oldu', 'admin.chatMeta.reprocessDocument');
      }

      return NextResponse.json({ ok: true });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const title = formData.get('title');

    if (!(file instanceof File) || typeof title !== 'string' || !title.trim()) {
      return apiError(400, 'file və title tələb olunur');
    }
    if (file.type !== 'application/pdf') {
      return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
    }

    const supabase = createAdminClient();
    const storagePath = `${crypto.randomUUID()}-${slugifyAssetFilename(file.name)}`;

    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file, { contentType: 'application/pdf' });
    if (uploadError) return serverError(uploadError, 'Faylı yükləmək uğursuz oldu');

    const { data: document, error: insertError } = await supabase
      .from('documents')
      .insert({ title: title.trim(), storage_path: storagePath, uploaded_by: auth.userId })
      .select()
      .single();
    if (insertError) return serverError(insertError, 'Sənəd yaratmaq uğursuz oldu');

    // The document row and upload already succeeded; ingestion progress/failure
    // is tracked via documents.status and surfaced through GET.
    try {
      await ingestDocument(document.id);
    } catch (err) {
      logApiError('admin.chatMeta.ingestDocument', err, { details: { documentId: document.id } });
    }

    return NextResponse.json({ document });
  }

  // Folded in from app/api/admin/quiz-questions/route.ts. `category` is
  // accepted but currently unused: the LLM picks a category per question
  // itself (lib/quiz/generateQuestionsFromPdf.ts), this field is reserved for
  // a future "bias toward this category" hint.
  if (type === 'quiz-questions') {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return apiError(400, 'file tələb olunur');
    }
    if (file.type !== 'application/pdf') {
      return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
    }

    let generated;
    try {
      const buffer = await file.arrayBuffer();
      generated = await generateQuestionsFromPdf(buffer);
    } catch (err) {
      logApiError('admin.chatMeta.generateQuizQuestions', err, { details: { fileName: file.name, fileSize: file.size } });
      return serverError(err, 'Sənəddən suallar hazırlamaq uğursuz oldu', 'admin.chatMeta.generateQuizQuestions');
    }

    if (generated.length === 0) {
      return NextResponse.json({ questions: [] });
    }

    const result = await createDraftQuestions(
      generated.map((q) => ({
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        category: q.category,
        explanation: q.explanation,
        sourceTitle: file.name,
        createdBy: auth.userId,
        isFineAmount: q.isFineAmount,
      }))
    );

    if (!result.ok) return apiError(500, result.error);

    return NextResponse.json({ questions: result.questions });
  }

  if (type !== 'busy-phrases') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const body = await request.json().catch(() => null);
  const stage = body?.stage;
  const phrase = body?.phrase;
  const displayOrder = body?.display_order ?? 0;

  if (!isBusyPhraseStage(stage)) {
    return apiError(400, `stage aşağıdakılardan biri olmalıdır: ${BUSY_PHRASE_STAGES.join(', ')}`);
  }

  if (typeof phrase !== 'string' || phrase.trim().length === 0) {
    return apiError(400, 'phrase boş ola bilməz');
  }

  if (typeof displayOrder !== 'number' || !Number.isInteger(displayOrder)) {
    return apiError(400, 'display_order tam ədəd olmalıdır');
  }

  const { data, error } = await createAdminClient()
    .from('chat_busy_phrases')
    .insert({ stage, phrase: phrase.trim(), display_order: displayOrder })
    .select('id, stage, phrase, display_order')
    .single();

  if (error) return serverError(error, 'Status cümləsini yaratmaq uğursuz oldu');

  return NextResponse.json({ phrase: data });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'busy-phrases') {
    const body = await request.json().catch(() => null);
    const id = body?.id;

    if (typeof id !== 'string' || id.trim().length === 0) {
      return apiError(400, 'id tələb olunur');
    }

    const update: Record<string, unknown> = {};

    if (body?.stage !== undefined) {
      if (!isBusyPhraseStage(body.stage)) {
        return apiError(400, `stage aşağıdakılardan biri olmalıdır: ${BUSY_PHRASE_STAGES.join(', ')}`);
      }
      update.stage = body.stage;
    }

    if (body?.phrase !== undefined) {
      if (typeof body.phrase !== 'string' || body.phrase.trim().length === 0) {
        return apiError(400, 'phrase boş ola bilməz');
      }
      update.phrase = body.phrase.trim();
    }

    if (body?.display_order !== undefined) {
      if (typeof body.display_order !== 'number' || !Number.isInteger(body.display_order)) {
        return apiError(400, 'display_order tam ədəd olmalıdır');
      }
      update.display_order = body.display_order;
    }

    if (Object.keys(update).length === 0) {
      return apiError(400, 'Yeniləmək üçün heç olmasa bir sahə tələb olunur');
    }

    update.updated_at = new Date().toISOString();

    const { data, error } = await createAdminClient()
      .from('chat_busy_phrases')
      .update(update)
      .eq('id', id)
      .select('id, stage, phrase, display_order')
      .single();

    if (error) return serverError(error, 'Status cümləsini yeniləmək uğursuz oldu');

    return NextResponse.json({ phrase: data });
  }

  // Folded in from app/api/admin/documents/route.ts — rename a document.
  if (type === 'documents') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const body = await request.json().catch(() => null);
    const title = body?.title;

    if (typeof title !== 'string' || !title.trim()) {
      return apiError(400, 'title tələb olunur');
    }

    const { data: document, error } = await createAdminClient()
      .from('documents')
      .update({ title: title.trim() })
      .eq('id', id)
      .select('id, title')
      .single();

    if (error || !document) return notFound('Sənəd tapılmadı');

    return NextResponse.json({ document });
  }

  if (type === 'coin-price') {
    const body = await request.json().catch(() => null);
    const price = body?.price;

    if (
      price !== null &&
      price !== undefined &&
      (typeof price !== 'number' || !Number.isFinite(price) || price <= 0 || price > MAX_ALLOWED_PRICE)
    ) {
      return apiError(400, `price null və ya 0-${MAX_ALLOWED_PRICE} arasında müsbət ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (price === null || price === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', COIN_PRICE_SETTING_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ price: DEFAULT_MESSAGE_PRICE, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: COIN_PRICE_SETTING_KEY, value: price, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ price, source: 'table' });
  }

  if (type === 'daily-coin-grant') {
    const body = await request.json().catch(() => null);
    const dailyCoinGrant = body?.dailyCoinGrant;

    if (
      dailyCoinGrant !== null &&
      dailyCoinGrant !== undefined &&
      (typeof dailyCoinGrant !== 'number' ||
        !Number.isInteger(dailyCoinGrant) ||
        dailyCoinGrant <= 0 ||
        dailyCoinGrant > MAX_ALLOWED)
    ) {
      return apiError(400, `dailyCoinGrant null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (dailyCoinGrant === null || dailyCoinGrant === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', DAILY_COIN_GRANT_SETTING_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ dailyCoinGrant: DEFAULT_DAILY_LIMIT, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: DAILY_COIN_GRANT_SETTING_KEY, value: dailyCoinGrant, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ dailyCoinGrant, source: 'table' });
  }

  if (type === 'daily-chest-reward') {
    const body = await request.json().catch(() => null);
    const dailyChestReward = body?.dailyChestReward;

    if (
      dailyChestReward !== null &&
      dailyChestReward !== undefined &&
      (typeof dailyChestReward !== 'number' ||
        !Number.isInteger(dailyChestReward) ||
        dailyChestReward <= 0 ||
        dailyChestReward > MAX_ALLOWED_CHEST_REWARD)
    ) {
      return apiError(400, `dailyChestReward null və ya 1-${MAX_ALLOWED_CHEST_REWARD} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (dailyChestReward === null || dailyChestReward === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', DAILY_CHEST_REWARD_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ dailyChestReward: DEFAULT_DAILY_CHEST_REWARD, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: DAILY_CHEST_REWARD_KEY, value: dailyChestReward, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ dailyChestReward, source: 'table' });
  }

  if (type === 'daily-mission-reward') {
    const body = await request.json().catch(() => null);
    const dailyMissionReward = body?.dailyMissionReward;

    if (
      dailyMissionReward !== null &&
      dailyMissionReward !== undefined &&
      (typeof dailyMissionReward !== 'number' ||
        !Number.isInteger(dailyMissionReward) ||
        dailyMissionReward <= 0 ||
        dailyMissionReward > MAX_ALLOWED_CHEST_REWARD)
    ) {
      return apiError(400, `dailyMissionReward null və ya 1-${MAX_ALLOWED_CHEST_REWARD} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (dailyMissionReward === null || dailyMissionReward === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', DAILY_MISSION_REWARD_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ dailyMissionReward: DEFAULT_DAILY_MISSION_REWARD, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: DAILY_MISSION_REWARD_KEY, value: dailyMissionReward, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ dailyMissionReward, source: 'table' });
  }

  if (type === 'daily-quiz-reward') {
    const body = await request.json().catch(() => null);
    const dailyQuizReward = body?.dailyQuizReward;

    if (
      dailyQuizReward !== null &&
      dailyQuizReward !== undefined &&
      (typeof dailyQuizReward !== 'number' ||
        !Number.isInteger(dailyQuizReward) ||
        dailyQuizReward <= 0 ||
        dailyQuizReward > MAX_ALLOWED_QUIZ_REWARD)
    ) {
      return apiError(400, `dailyQuizReward null və ya 1-${MAX_ALLOWED_QUIZ_REWARD} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (dailyQuizReward === null || dailyQuizReward === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', QUIZ_REWARD_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ dailyQuizReward: DEFAULT_QUIZ_REWARD, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: QUIZ_REWARD_KEY, value: dailyQuizReward, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ dailyQuizReward, source: 'table' });
  }

  if (type === 'lesson-economy') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update: only the params actually present are touched. null
    // explicitly RESETS a tunable to its TS-side default by deleting the row,
    // same convention as coin-price / daily-coin-grant above.
    const present = LESSON_ECONOMY_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${LESSON_ECONOMY_FIELDS.map((f) => f.param).join(', ')}`);
    }

    // Validate everything BEFORE writing anything, so a bad value in one field
    // can't leave a half-applied config — same all-or-nothing posture as the
    // 'user' branch below.
    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', LESSON_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      LESSON_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-economy') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update, all-or-nothing validation, null-resets-to-default — same
    // convention as lesson-economy above.
    const present = ENERGY_ECONOMY_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${ENERGY_ECONOMY_FIELDS.map((f) => f.param).join(', ')}`);
    }

    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_ECONOMY_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      ENERGY_ECONOMY_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-to-coin') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update, all-or-nothing validation, null-resets-to-default — same
    // convention as lesson-economy above.
    const present = ENERGY_TO_COIN_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${ENERGY_TO_COIN_FIELDS.map((f) => f.param).join(', ')}`);
    }

    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_TO_COIN_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const config = Object.fromEntries(
      ENERGY_TO_COIN_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [field.param, isConfigured ? numeric : field.defaultValue];
      })
    ) as { energyUnit: number; coinRate: number; dailyCap: number };

    const source = ENERGY_TO_COIN_FIELDS.some((field) => {
      const raw = byKey.get(field.key);
      const value = raw === undefined || raw === null ? null : Number(raw);
      return value !== null && isValidLessonEconomyValue(field, value);
    })
      ? 'table'
      : 'default';

    return NextResponse.json({ config, source });
  }

  if (type === 'game-rewards') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update, all-or-nothing validation, null-resets-to-default — same
    // convention as lesson-economy above.
    const present = GAME_REWARD_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${GAME_REWARD_FIELDS.map((f) => f.param).join(', ')}`);
    }

    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', GAME_REWARD_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      GAME_REWARD_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'energy-tuning') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update, all-or-nothing validation, null-resets-to-default — same
    // convention as game-rewards above.
    const present = ENERGY_TUNING_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${ENERGY_TUNING_FIELDS.map((f) => f.param).join(', ')}`);
    }

    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', ENERGY_TUNING_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      ENERGY_TUNING_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  if (type === 'garage-perks') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    // Partial update, all-or-nothing validation, null-resets-to-default — same
    // convention as game-rewards above.
    const present = GARAGE_PERK_FIELDS.filter((f) => body[f.param] !== undefined);

    if (present.length === 0) {
      return apiError(400, `Yeniləmək üçün heç olmasa bir sahə tələb olunur: ${GARAGE_PERK_FIELDS.map((f) => f.param).join(', ')}`);
    }

    for (const field of present) {
      const value = body[field.param];
      if (value === null) continue;
      if (typeof value !== 'number' || !isValidLessonEconomyValue(field, value)) {
        return apiError(
          400,
          `${field.param} null və ya ${field.min}-${field.max} arasında ${field.integerOnly ? 'tam ' : ''}ədəd olmalıdır`
        );
      }
    }

    const admin = createAdminClient();

    for (const field of present) {
      const value = body[field.param];

      if (value === null) {
        const { error } = await admin.from('app_settings').delete().eq('key', field.key);
        if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
        continue;
      }

      const { error } = await admin
        .from('app_settings')
        .upsert({ key: field.key, value, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    const { data, error } = await admin
      .from('app_settings')
      .select('key, value')
      .in('key', GARAGE_PERK_KEYS);

    if (error) return serverError(error, 'Ayarları oxumaq uğursuz oldu');

    const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));

    const settings = Object.fromEntries(
      GARAGE_PERK_FIELDS.map((field) => {
        const raw = byKey.get(field.key);
        const numeric = raw === undefined || raw === null ? null : Number(raw);
        const isConfigured = numeric !== null && isValidLessonEconomyValue(field, numeric);
        return [
          field.param,
          {
            value: isConfigured ? numeric : field.defaultValue,
            source: isConfigured ? 'table' : 'default',
          },
        ];
      })
    );

    return NextResponse.json({ settings });
  }

  // Virtual Qaraj (0083_virtual_garage.sql) — only coin_price is editable per
  // row; name/emoji are immutable seed data. tierId always resolves the row
  // to update; price never comes from anywhere but this validated body.
  if (type === 'car-tiers') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return apiError(400, 'Gövdə düzgün deyil');

    const { tierId, coinPrice } = body as { tierId?: unknown; coinPrice?: unknown };

    if (typeof tierId !== 'string' || tierId.length === 0) {
      return apiError(400, 'tierId tələb olunur');
    }
    if (typeof coinPrice !== 'number' || !Number.isFinite(coinPrice) || coinPrice < 0 || coinPrice > MAX_ALLOWED_PRICE) {
      return apiError(400, `coinPrice 0-${MAX_ALLOWED_PRICE} arasında ədəd olmalıdır`);
    }

    const { data, error } = await createAdminClient()
      .from('car_tiers')
      .update({ coin_price: coinPrice })
      .eq('id', tierId)
      .select('id, tier_order, name, emoji, coin_price')
      .maybeSingle();

    if (error) return serverError(error, 'Avtomobil qiymətini yeniləmək uğursuz oldu');
    if (!data) return notFound('Avtomobil tapılmadı');

    const tier: CarTier = {
      id: data.id,
      tierOrder: data.tier_order,
      name: data.name,
      emoji: data.emoji,
      coinPrice: Number(data.coin_price),
    };

    return NextResponse.json({ tier });
  }

  // Virtual Qaraj Mərhələ 3 (VIP Nömrə Bazarı) — same single-field
  // null-resets-to-default convention as daily-chest-reward above.
  if (type === 'vip-plate-price') {
    const body = await request.json().catch(() => null);
    const vipPlatePrice = body?.vipPlatePrice;

    if (
      vipPlatePrice !== null &&
      vipPlatePrice !== undefined &&
      (typeof vipPlatePrice !== 'number' ||
        !Number.isInteger(vipPlatePrice) ||
        vipPlatePrice <= 0 ||
        vipPlatePrice > MAX_ALLOWED)
    ) {
      return apiError(400, `vipPlatePrice null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (vipPlatePrice === null || vipPlatePrice === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', VIP_PLATE_PRICE_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ vipPlatePrice: DEFAULT_VIP_PLATE_PRICE, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: VIP_PLATE_PRICE_KEY, value: vipPlatePrice, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ vipPlatePrice, source: 'table' });
  }

  // Çarx (wheel of fortune) — replaces all 10 segments at once (value +
  // weight per segment); weights must sum to exactly 100 so spinWheel()'s
  // weighted draw has well-defined odds.
  if (type === 'wheel-prizes') {
    const body = await request.json().catch(() => null);
    const prizes = body?.prizes;

    if (!Array.isArray(prizes) || prizes.length !== 10) {
      return apiError(400, 'prizes tam olaraq 10 element olan massiv olmalıdır');
    }

    const parsed: WheelPrize[] = [];
    for (const entry of prizes) {
      const value = entry?.value;
      const weight = entry?.weight;
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return apiError(400, 'Hər value müsbət ədəd olmalıdır');
      }
      if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
        return apiError(400, 'Hər weight müsbət ədəd olmalıdır');
      }
      parsed.push({ value, weight });
    }

    const weightSum = parsed.reduce((sum, p) => sum + p.weight, 0);
    if (Math.abs(weightSum - 100) >= 0.01) {
      return apiError(400, `Faizlərin cəmi 100 olmalıdır, hazırda ${weightSum}%`);
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('app_settings')
      .upsert({ key: WHEEL_PRIZES_KEY, value: parsed, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ prizes: parsed });
  }

  // Heftəlik marafon — replaces all 7 chest slots at once (type + amount per
  // slot). Slots are STREAK-DAY-indexed since 0097 (index 0 = streak day 1 ..
  // index 6 = streak day 7 = COINS; no longer weekday-anchored) — the code
  // shape is unchanged: still exactly 7 slots, type+amount, all-or-nothing.
  // The ENTIRE array is validated before anything is written, so a bad slot
  // can never leave a half-applied cycle that would pay the wrong currency on
  // some days. Amounts are integer-only and bounded by MAX_ALLOWED_MARATHON_REWARD.
  if (type === 'weekly-marathon') {
    const body = await request.json().catch(() => null);
    const schedule = body?.schedule;

    if (!Array.isArray(schedule) || schedule.length !== 7) {
      return apiError(400, 'schedule tam olaraq 7 element olan massiv olmalıdır');
    }

    const parsed: WeeklyMarathonSlot[] = [];
    for (const entry of schedule) {
      const type = entry?.type;
      const amount = entry?.amount;
      if (type !== 'energy' && type !== 'coins') {
        return apiError(400, 'Hər slotun type sahəsi "energy" və ya "coins" olmalıdır');
      }
      if (
        typeof amount !== 'number' ||
        !Number.isInteger(amount) ||
        amount < 1 ||
        amount > MAX_ALLOWED_MARATHON_REWARD
      ) {
        return apiError(400, `Hər slotun amount sahəsi 1-${MAX_ALLOWED_MARATHON_REWARD} arasında tam ədəd olmalıdır`);
      }
      parsed.push({ type, amount });
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from('app_settings')
      .upsert({ key: WEEKLY_MARATHON_REWARDS_KEY, value: parsed, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ schedule: parsed, source: 'table' });
  }

  if (type === 'category-content') {
    const body = await request.json().catch(() => null);
    const incoming = body?.overrides;

    if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming) || Object.keys(incoming).length === 0) {
      return apiError(400, 'overrides obyekti tələb olunur');
    }

    // Validate everything BEFORE writing anything — same all-or-nothing
    // posture as lesson-economy above. Titles are fixed identifiers, so an
    // unknown one is a client bug, not new content.
    for (const [title, fields] of Object.entries(incoming)) {
      if (!VALID_CATEGORY_TITLES.has(title)) {
        return apiError(400, `Naməlum kateqoriya: ${title}`);
      }
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
        return apiError(400, `${title} üçün sahələr obyekt olmalıdır`);
      }
      for (const [field, value] of Object.entries(fields)) {
        if (!(OVERRIDABLE_CATEGORY_FIELDS as readonly string[]).includes(field)) {
          return apiError(400, `Naməlum sahə: ${title}.${field}`);
        }
        if (typeof value !== 'string') {
          return apiError(400, `${title}.${field} mətn olmalıdır`);
        }
        if (value.trim().length > MAX_CATEGORY_FIELD_LENGTH) {
          return apiError(400, `${title}.${field} maksimum ${MAX_CATEGORY_FIELD_LENGTH} simvol ola bilər`);
        }
      }
    }

    const admin = createAdminClient();

    const { data: existingRow, error: readError } = await admin
      .from('app_settings')
      .select('value')
      .eq('key', CATEGORY_OVERRIDES_SETTING_KEY)
      .maybeSingle();
    if (readError) return serverError(readError, 'Ayarları oxumaq uğursuz oldu');

    // Partial update: only the titles/fields present are touched; an empty
    // string RESETS that field to its TS-side default by removing the
    // override — same null-resets convention as lesson-economy, adapted to
    // string fields.
    const merged = parseCategoryOverrides(existingRow?.value);
    for (const [title, fields] of Object.entries(incoming)) {
      const entry = { ...(merged[title] ?? {}) };
      for (const [field, value] of Object.entries(fields as Record<string, string>)) {
        const trimmed = value.trim();
        if (trimmed.length === 0) delete entry[field as OverridableCategoryField];
        else entry[field as OverridableCategoryField] = trimmed;
      }
      if (Object.keys(entry).length === 0) delete merged[title];
      else merged[title] = entry;
    }

    if (Object.keys(merged).length === 0) {
      const { error } = await admin.from('app_settings').delete().eq('key', CATEGORY_OVERRIDES_SETTING_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    } else {
      const { error } = await admin
        .from('app_settings')
        .upsert({ key: CATEGORY_OVERRIDES_SETTING_KEY, value: merged, updated_at: new Date().toISOString() });
      if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');
    }

    return NextResponse.json(buildCategoryContentResponse(merged));
  }

  if (type === 'user') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const body = await request.json().catch(() => null);
    const hasRole = body?.role !== undefined;
    const hasDailyCoinLimit = body?.dailyCoinLimit !== undefined;
    const hasGrantCoins = body?.grantCoins !== undefined;
    const hasGrantEnergy = body?.grantEnergy !== undefined;

    if (!hasRole && !hasDailyCoinLimit && !hasGrantCoins && !hasGrantEnergy) {
      return apiError(400, 'role, dailyCoinLimit, grantCoins və ya grantEnergy göndərilməlidir');
    }

    // dailyCoinLimit/grantCoins are handled separately below (they write to
    // user_coins via the service-role client, not profiles via the
    // RLS-respecting one) — validated up front here so a bad value in either
    // field fails the whole request before any write happens, same
    // all-or-nothing validation posture as role below.
    if (hasDailyCoinLimit) {
      const dailyCoinLimit = body.dailyCoinLimit;
      if (
        dailyCoinLimit !== null &&
        (typeof dailyCoinLimit !== 'number' ||
          !Number.isFinite(dailyCoinLimit) ||
          dailyCoinLimit <= 0 ||
          dailyCoinLimit > MAX_ALLOWED_DAILY_COIN_LIMIT)
      ) {
        return apiError(400, `dailyCoinLimit null və ya 0-${MAX_ALLOWED_DAILY_COIN_LIMIT} arasında müsbət ədəd olmalıdır`);
      }
    }

    if (hasGrantCoins) {
      const grantCoins = body.grantCoins;
      if (typeof grantCoins !== 'number' || !Number.isFinite(grantCoins) || grantCoins === 0 || Math.abs(grantCoins) > MAX_ALLOWED_COIN_GRANT) {
        return apiError(400, `grantCoins sıfırdan fərqli, mütləq dəyəri ${MAX_ALLOWED_COIN_GRANT}-dən az ədəd olmalıdır`);
      }
    }

    if (hasGrantEnergy) {
      const grantEnergy = body.grantEnergy;
      if (typeof grantEnergy !== 'number' || !Number.isInteger(grantEnergy) || grantEnergy === 0 || Math.abs(grantEnergy) > MAX_ALLOWED_ENERGY_GRANT) {
        return apiError(400, `grantEnergy sıfırdan fərqli, mütləq dəyəri ${MAX_ALLOWED_ENERGY_GRANT}-dən az tam ədəd olmalıdır`);
      }
    }

    const update: { role?: string } = {};

    if (hasRole) {
      const role = body.role;
      if (typeof role !== 'string' || !ASSIGNABLE_ROLES.has(role)) {
        return apiError(400, "role 'admin' və ya 'user' olmalıdır");
      }
      if (id === auth.userId) {
        return apiError(400, 'Öz rolunuzu bu yolla dəyişə bilməzsiniz');
      }
      update.role = role;
    }

    const supabase = await createClient();

    let profile: { id: string; role: string } | null;

    if (hasRole) {
      // RLS-respecting client: relies on the profiles_update_admin policy
      // (0026_remove_super_admin.sql), which itself checks is_admin() — so this
      // update fails closed even if the requireAdmin() check above were ever
      // bypassed.
      const { data, error } = await supabase
        .from('profiles')
        .update(update)
        .eq('id', id)
        .select('id, role')
        .maybeSingle();

      if (error) return serverError(error, 'İstifadəçini yeniləmək uğursuz oldu');
      profile = data;
    } else {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('id', id)
        .maybeSingle();

      if (error) return serverError(error, 'İstifadəçi məlumatı alınmadı');
      profile = data;
    }

    if (!profile) return notFound('İstifadəçi tapılmadı');

    // user_coins is not RLS-writable by admins (0036 — only a self-SELECT
    // policy exists), so these two writes use the service-role client, same
    // pattern as ingestion/document routes: legitimate only because
    // requireAdmin() has already gated this whole handler.
    let coins: { balance: number; daily_limit: number | null } | null = null;
    if (hasDailyCoinLimit || hasGrantCoins) {
      const admin = createAdminClient();

      if (hasDailyCoinLimit) {
        const dailyCoinLimit = body.dailyCoinLimit;
        const { error: coinError } = await admin
          .from('user_coins')
          .upsert({ user_id: id, daily_limit: dailyCoinLimit ?? null }, { onConflict: 'user_id', ignoreDuplicates: false });
        if (coinError) return serverError(coinError, 'Gündəlik coin limitini yeniləmək uğursuz oldu');
      }

      if (hasGrantCoins) {
        const grantCoins = body.grantCoins;
        // Row may not exist yet for a user who has never sent a chat message —
        // ensure it exists before the increment RPC-less update below (a plain
        // upsert with balance = balance + amount can't reference the existing
        // value across an insert, so this uses insert-if-missing then a
        // separate update, not fully race-free but acceptable here since grants
        // are an infrequent admin action, not a hot concurrent path like debit).
        await admin.from('user_coins').insert({ user_id: id }).select('user_id').maybeSingle();
        const { data: current, error: readError } = await admin
          .from('user_coins')
          .select('balance')
          .eq('user_id', id)
          .single();
        if (readError) return serverError(readError, 'Coin balansını oxumaq uğursuz oldu');

        const newBalance = Math.max(0, Number(current.balance) + grantCoins);
        const { error: grantError } = await admin.from('user_coins').update({ balance: newBalance }).eq('user_id', id);
        if (grantError) return serverError(grantError, 'Coin hədiyyə etmək uğursuz oldu');
      }

      const { data: coinRow, error: coinReadError } = await admin
        .from('user_coins')
        .select('balance, daily_limit')
        .eq('user_id', id)
        .maybeSingle();
      if (coinReadError) return serverError(coinReadError, 'Coin məlumatını oxumaq uğursuz oldu');
      coins = coinRow ?? null;
    }

    // user_energy is RLS select-own only (0067), so like user_coins above the
    // service-role client is mandatory — legitimate only because requireAdmin()
    // has already gated this whole handler.
    let energy: { balance: number } | null = null;
    if (hasGrantEnergy) {
      const admin = createAdminClient();
      const grantEnergy = body.grantEnergy;
      if (grantEnergy > 0) {
        // credit_energy (0094) is the sanctioned energy-credit path:
        // insert-if-missing + balance += greatest(0, round(amount)); service-role-only.
        const { error } = await admin.rpc('credit_energy', { p_user_id: id, p_amount: grantEnergy });
        if (error) return serverError(error, 'Enerji hədiyyə etmək uğursuz oldu');
      } else {
        // credit_energy clamps negatives to 0, so subtraction is a direct
        // service-role update: read current, clamp at 0 in JS, write back.
        // No row -> effective balance 0, subtraction is a silent no-op (correct).
        const { data: current, error: readError } = await admin
          .from('user_energy')
          .select('balance')
          .eq('user_id', id)
          .maybeSingle();
        if (readError) return serverError(readError, 'Enerji balansını oxumaq uğursuz oldu');
        if (current) {
          const newBalance = Math.max(0, Number(current.balance) + grantEnergy);
          const { error: updateError } = await admin
            .from('user_energy')
            .update({ balance: newBalance })
            .eq('user_id', id);
          if (updateError) return serverError(updateError, 'Enerji çıxartmaq uğursuz oldu');
        }
      }
      // Read the fresh balance for the response (works for both branches).
      const { data: energyRow, error: energyReadError } = await admin
        .from('user_energy')
        .select('balance')
        .eq('user_id', id)
        .maybeSingle();
      if (energyReadError) return serverError(energyReadError, 'Enerji məlumatını oxumaq uğursuz oldu');
      energy = energyRow ? { balance: Number(energyRow.balance) } : null;
    }

    return NextResponse.json({ profile, coins, energy });
  }

  // Global daily LLM circuit breaker cap (0093). Mirrors the rate-limit branch
  // below: null resets to the TS/env default by deleting the app_settings row.
  if (type === 'llm-circuit-breaker') {
    const body = await request.json().catch(() => null);
    const cap = body?.cap;

    if (
      cap !== null &&
      cap !== undefined &&
      (typeof cap !== 'number' || !Number.isInteger(cap) || cap <= 0 || cap > MAX_ALLOWED)
    ) {
      return apiError(400, `cap null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
    }

    const admin = createAdminClient();

    if (cap === null || cap === undefined) {
      const { error } = await admin.from('app_settings').delete().eq('key', DAILY_LLM_MESSAGE_CAP_KEY);
      if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
      return NextResponse.json({ cap: DEFAULT_DAILY_LLM_MESSAGE_CAP, source: 'default' });
    }

    const { error } = await admin
      .from('app_settings')
      .upsert({ key: DAILY_LLM_MESSAGE_CAP_KEY, value: cap, updated_at: new Date().toISOString() });

    if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

    return NextResponse.json({ cap, source: 'table' });
  }

  if (type !== 'rate-limit') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const body = await request.json().catch(() => null);
  const maxPerDay = body?.maxPerDay;

  if (
    maxPerDay !== null &&
    maxPerDay !== undefined &&
    (typeof maxPerDay !== 'number' ||
      !Number.isInteger(maxPerDay) ||
      maxPerDay <= 0 ||
      maxPerDay > MAX_ALLOWED)
  ) {
    return apiError(400, `maxPerDay null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
  }

  const admin = createAdminClient();

  if (maxPerDay === null || maxPerDay === undefined) {
    const { error } = await admin.from('app_settings').delete().eq('key', GLOBAL_DEFAULT_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ maxPerDay: ENV_DEFAULT_MAX_PER_WINDOW, source: 'env' });
  }

  const { error } = await admin
    .from('app_settings')
    .upsert({ key: GLOBAL_DEFAULT_SETTING_KEY, value: maxPerDay, updated_at: new Date().toISOString() });

  if (error) return serverError(error, 'Ayarı yeniləmək uğursuz oldu');

  return NextResponse.json({ maxPerDay, source: 'table' });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  if (type === 'background-image') {
    // Only clears the app_settings override so the home page falls back to
    // the static /bg.png; the now-orphaned object is left in the
    // public-assets bucket rather than deleted here — same low-stakes
    // tradeoff as other reset branches in this file (e.g. coin-price PATCH
    // null) which don't clean up anything beyond the setting row.
    const { error } = await createAdminClient().from('app_settings').delete().eq('key', HOME_BACKGROUND_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ url: null });
  }

  if (type === 'logo') {
    // Same orphaned-storage-object tradeoff as background-image above.
    const { error } = await createAdminClient().from('app_settings').delete().eq('key', SITE_LOGO_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json({ url: null });
  }

  // Folded in from app/api/admin/documents/route.ts — `?id=` deletes one,
  // a JSON body `{ ids: [...] }` deletes many.
  if (type === 'documents') {
    const documentId = searchParams.get('id');
    const supabase = createAdminClient();

    if (documentId) {
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('storage_path')
        .eq('id', documentId)
        .single();
      if (fetchError || !document) {
        return notFound('Sənəd tapılmadı');
      }

      try {
        await deleteDocuments(supabase, [documentId]);
      } catch (error) {
        return serverError(error, 'Sənədi silmək uğursuz oldu', 'admin.chatMeta.deleteDocument');
      }

      return NextResponse.json({ ok: true });
    }

    const body = await request.json().catch(() => null);
    const ids = body?.ids;

    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((value) => typeof value === 'string')) {
      return apiError(400, 'ids tələb olunur');
    }

    try {
      const { deletedCount } = await deleteDocuments(supabase, ids);
      return NextResponse.json({ ok: true, deleted: deletedCount });
    } catch (error) {
      return serverError(error, 'Sənədləri silmək uğursuz oldu', 'admin.chatMeta.deleteDocuments');
    }
  }

  if (type === 'category-content') {
    // Full reset to the TS-side defaults in RULE_CATEGORIES — same
    // row-delete-means-default convention as background-image/logo above.
    const { error } = await createAdminClient().from('app_settings').delete().eq('key', CATEGORY_OVERRIDES_SETTING_KEY);
    if (error) return serverError(error, 'Ayarı sıfırlamaq uğursuz oldu');
    return NextResponse.json(buildCategoryContentResponse({}));
  }

  // Moderation tool, NOT a refund system — freeing the row does not credit
  // coins back to the (former) owner.
  if (type === 'plate-moderation') {
    const body = await request.json().catch(() => null);
    const plateNumber = body?.plateNumber;

    if (typeof plateNumber !== 'string' || plateNumber.trim().length === 0) {
      return apiError(400, 'plateNumber tələb olunur');
    }

    const { error } = await createAdminClient().from('license_plates').delete().eq('plate_number', plateNumber);
    if (error) return serverError(error, 'Nömrəni silmək uğursuz oldu');

    return NextResponse.json({ ok: true });
  }

  if (type !== 'busy-phrases') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  let id = searchParams.get('id');
  if (!id) {
    const body = await request.json().catch(() => null);
    id = body?.id ?? null;
  }

  if (typeof id !== 'string' || id.trim().length === 0) {
    return apiError(400, 'id tələb olunur');
  }

  const { error } = await createAdminClient().from('chat_busy_phrases').delete().eq('id', id);

  if (error) return serverError(error, 'Status cümləsini silmək uğursuz oldu');

  return NextResponse.json({ ok: true });
}
