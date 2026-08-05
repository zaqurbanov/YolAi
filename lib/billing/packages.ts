import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';

// Data layer for the billing catalog (0101_billing_packages.sql).
//
// AUTHORIZATION IS NOT DONE HERE. Every write below uses the service-role
// client and therefore bypasses RLS. requireAdmin() must already have run in
// the calling server action — see app/admin/paketler/actions.ts, where it is
// the unconditional first statement. Same posture as lib/lessons/courses.ts.
//
// Prices live in the DATABASE, not in this file. There is deliberately no
// TS-side default package: unlike the app_settings tunables (which fail open to
// a hardcoded default so a missing row can never break a page), a catalog with
// no rows is a legitimate state that renders an empty list. The owner sets
// every price, because they have to move with inflation without a deploy.

export type PackageKind = 'subscription' | 'one_time';
export type PackageStatus = 'draft' | 'active' | 'archived';

export interface BillingPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: PackageKind;
  /** In `currency`, as the admin typed it. */
  price: number;
  currency: string;
  /** Subscription only — how long one purchase lasts. */
  periodDays: number | null;
  /**
   * SUBSCRIPTION grants are daily FLOORS, never monthly lumps — apply_daily_grant
   * tops a balance up to a floor and skips anyone already above it, so a lump
   * would suppress the daily grant and leave a subscriber worse off than a free
   * user. See the 0101 header.
   */
  coinDailyFloor: number | null;
  energyDailyFloor: number | null;
  /** One-time grants. */
  coinAmount: number | null;
  energyAmount: number | null;
  adsDisabled: boolean;
  badgeLabel: string | null;
  provider: string | null;
  providerPriceId: string | null;
  status: PackageStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface PackageRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: PackageKind;
  price: number | string;
  currency: string;
  period_days: number | null;
  coin_daily_floor: number | string | null;
  energy_daily_floor: number | null;
  coin_amount: number | string | null;
  energy_amount: number | null;
  ads_disabled: boolean;
  badge_label: string | null;
  provider: string | null;
  provider_price_id: string | null;
  status: PackageStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const COLUMNS =
  'id, code, name, description, kind, price, currency, period_days, coin_daily_floor, energy_daily_floor, coin_amount, energy_amount, ads_disabled, badge_label, provider, provider_price_id, status, sort_order, created_at, updated_at';

// numeric(10,2) comes back from PostgREST as a string often enough that every
// caller would otherwise have to remember. Parsed once, here.
function num(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPackage(row: PackageRow): BillingPackage {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    kind: row.kind,
    price: num(row.price) ?? 0,
    currency: row.currency,
    periodDays: row.period_days,
    coinDailyFloor: num(row.coin_daily_floor),
    energyDailyFloor: row.energy_daily_floor,
    coinAmount: num(row.coin_amount),
    energyAmount: row.energy_amount,
    adsDisabled: row.ads_disabled,
    badgeLabel: row.badge_label,
    provider: row.provider,
    providerPriceId: row.provider_price_id,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Admin view: every package regardless of status. Service-role. */
export async function listPackages(): Promise<BillingPackage[]> {
  const { data, error } = await createAdminClient()
    .from('billing_packages')
    .select(COLUMNS)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .returns<PackageRow[]>();

  if (error || !data) {
    // Pre-migration state renders an empty list rather than erroring, same
    // rationale as lib/lessons/courses.ts.
    if (isMissingRelationError(error)) return [];
    void logError('billing.packages.list', error);
    console.error('[billing/packages] listPackages failed:', error);
    return [];
  }

  return data.map(toPackage);
}

/**
 * User-facing view: ACTIVE packages only, read with the USER-SCOPED client so
 * RLS (0101) is a real second line of defence rather than something only this
 * function's where-clause enforces.
 */
export async function listActivePackages(): Promise<BillingPackage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('billing_packages')
    .select(COLUMNS)
    .eq('status', 'active')
    .order('sort_order', { ascending: true })
    .returns<PackageRow[]>();

  if (error || !data) {
    if (isMissingRelationError(error)) return [];
    void logError('billing.packages.listActive', error);
    console.error('[billing/packages] listActivePackages failed:', error);
    return [];
  }

  return data.map(toPackage);
}

/**
 * THE server-side resolver for a purchase. A package id arriving from a client
 * is an arbitrary uuid until this says otherwise, and the price/grants used to
 * charge and to credit must come from HERE, never from the request — the same
 * rule every coin-granting path in this app follows.
 *
 * Returns null for a nonexistent package and for a non-active one alike.
 */
export async function getActivePackage(id: string): Promise<BillingPackage | null> {
  if (typeof id !== 'string' || id.trim() === '') return null;

  const { data, error } = await createAdminClient()
    .from('billing_packages')
    .select(COLUMNS)
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle<PackageRow>();

  if (error) {
    if (!isMissingRelationError(error)) {
      void logError('billing.packages.getActive', error, { details: { packageId: id } });
      console.error('[billing/packages] getActivePackage failed:', error);
    }
    return null;
  }

  return data ? toPackage(data) : null;
}

export interface PackageInput {
  code: string;
  name: string;
  description?: string | null;
  kind: PackageKind;
  price: number;
  currency?: string;
  periodDays?: number | null;
  coinDailyFloor?: number | null;
  energyDailyFloor?: number | null;
  coinAmount?: number | null;
  energyAmount?: number | null;
  adsDisabled?: boolean;
  badgeLabel?: string | null;
  provider?: string | null;
  providerPriceId?: string | null;
  status?: PackageStatus;
  sortOrder?: number;
}

export type PackageResult<T> = { ok: true; data: T } | { ok: false; error: string };

// Validated in TS as well as by the CHECK constraints in 0101 — the constraints
// are the real guarantee, these produce a message the admin form can show
// instead of a raw Postgres error string.
function validate(input: PackageInput): string | null {
  if (!input.code.trim()) return 'Kod boş ola bilməz';
  if (!/^[a-z0-9-]+$/.test(input.code.trim())) {
    return 'Kod yalnız kiçik hərf, rəqəm və tire ola bilər (məsələn: pro-monthly)';
  }
  if (!input.name.trim()) return 'Ad boş ola bilməz';
  if (!Number.isFinite(input.price) || input.price < 0) return 'Qiymət 0 və ya müsbət olmalıdır';

  if (input.kind === 'subscription') {
    if (!input.periodDays || input.periodDays <= 0) {
      return 'Abunə üçün müddət (gün) mütləqdir';
    }
    if (!(input.coinDailyFloor ?? 0) && !(input.energyDailyFloor ?? 0)) {
      return 'Abunə ən azı bir gündəlik döşəmə verməlidir (coin və ya enerji)';
    }
  }

  if (input.kind === 'one_time') {
    if (!(input.coinAmount ?? 0) && !(input.energyAmount ?? 0)) {
      return 'Birdəfəlik paket ən azı bir məbləğ verməlidir (coin və ya enerji)';
    }
  }

  return null;
}

// Shared row builder. Undefined fields are omitted on update (leaving the
// stored value alone) but written as null on create.
function toRow(input: PackageInput): Record<string, unknown> {
  return {
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    kind: input.kind,
    price: input.price,
    currency: input.currency?.trim() || 'AZN',
    // A subscription's lump columns and a one-time's floor columns are actively
    // NULLED rather than left stale: switching a package's kind must not leave
    // grants from the other shape behind, where a future purchase path could
    // read them.
    period_days: input.kind === 'subscription' ? (input.periodDays ?? null) : null,
    coin_daily_floor: input.kind === 'subscription' ? (input.coinDailyFloor ?? null) : null,
    energy_daily_floor: input.kind === 'subscription' ? (input.energyDailyFloor ?? null) : null,
    coin_amount: input.kind === 'one_time' ? (input.coinAmount ?? null) : null,
    energy_amount: input.kind === 'one_time' ? (input.energyAmount ?? null) : null,
    ads_disabled: input.adsDisabled ?? false,
    badge_label: input.badgeLabel?.trim() || null,
    provider: input.provider?.trim() || null,
    provider_price_id: input.providerPriceId?.trim() || null,
    status: input.status ?? 'draft',
    sort_order: input.sortOrder ?? 0,
  };
}

export async function createPackage(input: PackageInput): Promise<PackageResult<BillingPackage>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await createAdminClient()
    .from('billing_packages')
    .insert(toRow(input))
    .select(COLUMNS)
    .single<PackageRow>();

  if (error || !data) {
    void logError('billing.packages.create', error);
    console.error('[billing/packages] createPackage failed:', error);
    if (isMissingRelationError(error)) {
      return { ok: false, error: 'Paket cədvəli hələ yaradılmayıb (0101 migrasiyası icra edilməyib)' };
    }
    if (error?.code === '23505') return { ok: false, error: 'Bu kod artıq istifadə olunub' };
    return { ok: false, error: 'Paketi yaratmaq uğursuz oldu' };
  }

  return { ok: true, data: toPackage(data) };
}

export async function updatePackage(
  id: string,
  input: PackageInput
): Promise<PackageResult<BillingPackage>> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };

  const { data, error } = await createAdminClient()
    .from('billing_packages')
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(COLUMNS)
    .single<PackageRow>();

  if (error || !data) {
    void logError('billing.packages.update', error, { details: { packageId: id } });
    console.error('[billing/packages] updatePackage failed:', error);
    if (error?.code === '23505') return { ok: false, error: 'Bu kod artıq istifadə olunub' };
    return { ok: false, error: 'Paketi yeniləmək uğursuz oldu' };
  }

  return { ok: true, data: toPackage(data) };
}

/**
 * Hard delete. Intended for a draft that was created by mistake — a package
 * that has ever been SOLD must be archived instead, so an existing
 * subscriber's row still resolves to the terms they bought. Nothing references
 * billing_packages yet, so there is no FK to stop a mistake here; that guard
 * arrives with the purchase table.
 */
export async function deletePackage(id: string): Promise<PackageResult<null>> {
  const { error } = await createAdminClient().from('billing_packages').delete().eq('id', id);

  if (error) {
    void logError('billing.packages.delete', error, { details: { packageId: id } });
    console.error('[billing/packages] deletePackage failed:', error);
    return { ok: false, error: 'Paketi silmək uğursuz oldu' };
  }

  return { ok: true, data: null };
}
