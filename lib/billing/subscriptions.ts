import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingRelationError } from '@/lib/supabase/missingRelation';
import { logError } from '@/lib/logging/logError';
import { getActivePackage, type BillingPackage } from '@/lib/billing/packages';

// Who currently holds which package (0102_billing_subscriptions.sql).
//
// THE ONE THING THIS MODULE EXISTS FOR: answering "what are this user's daily
// floors". lib/coins/dailyGrant.ts calls getActiveSubscription() and raises the
// free floors to the package's, and that is the entire subscription mechanic —
// there is no second wallet and no lump grant. See 0101's header for why a
// monthly lump would leave a subscriber worse off than a free user.
//
// AUTHORIZATION IS NOT DONE HERE. Reads use the service-role client so they are
// independent of the caller's RLS context (callers pass a userId they have
// already authenticated); writes are reachable only from admin server actions
// that run requireAdmin() first, or later from a verified payment callback.

export interface ActiveSubscription {
  id: string;
  userId: string;
  packageId: string;
  packageName: string;
  packageCode: string;
  /** Daily floors this subscription guarantees. Null means "grants none". */
  coinDailyFloor: number | null;
  energyDailyFloor: number | null;
  adsDisabled: boolean;
  badgeLabel: string | null;
  source: string;
  startedAt: string;
  expiresAt: string;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  package_id: string;
  status: 'active' | 'expired' | 'canceled';
  source: string;
  started_at: string;
  expires_at: string;
}

const ROW_COLUMNS = 'id, user_id, package_id, status, source, started_at, expires_at';

/**
 * The user's live subscription, or null.
 *
 * Sweeps a lapsed row to 'expired' on the way through (see the 0102 header for
 * why expiry is lazy rather than a scheduled job). Fails CLOSED: any read error
 * returns null, i.e. the user is treated as unsubscribed and simply keeps the
 * free floors. That is the safe direction — the failure mode is "did not get
 * the perk", never "got a perk they did not buy".
 */
export async function getActiveSubscription(userId: string): Promise<ActiveSubscription | null> {
  if (typeof userId !== 'string' || userId.trim() === '') return null;

  const admin = createAdminClient();

  const { data, error } = await admin
    .from('billing_subscriptions')
    .select(ROW_COLUMNS)
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle<SubscriptionRow>();

  if (error) {
    // Pre-migration state is silent: the table simply does not exist yet, and
    // every balance read would otherwise log on every request.
    if (!isMissingRelationError(error)) {
      void logError('billing.subscriptions.getActive', error, { userId });
      console.error('[billing/subscriptions] getActiveSubscription failed:', error);
    }
    return null;
  }
  if (!data) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    // Lazy expiry. Scoped to status='active' so two concurrent sweeps collide
    // harmlessly instead of resurrecting or double-writing the row.
    const { error: sweepError } = await admin
      .from('billing_subscriptions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', data.id)
      .eq('status', 'active');

    if (sweepError) {
      void logError('billing.subscriptions.expireSweep', sweepError, {
        userId,
        details: { subscriptionId: data.id },
      });
      console.error('[billing/subscriptions] expiry sweep failed:', sweepError);
    }
    return null;
  }

  // The package is read through getActivePackage so an ARCHIVED package still
  // resolves for someone who already holds it... except getActivePackage filters
  // on status='active'. Read directly instead: an archived package must keep
  // serving its existing subscribers, which is exactly why 0101 says archive
  // rather than delete.
  const { data: pkg, error: pkgError } = await admin
    .from('billing_packages')
    .select('id, code, name, coin_daily_floor, energy_daily_floor, ads_disabled, badge_label')
    .eq('id', data.package_id)
    .maybeSingle<{
      id: string;
      code: string;
      name: string;
      coin_daily_floor: number | string | null;
      energy_daily_floor: number | null;
      ads_disabled: boolean;
      badge_label: string | null;
    }>();

  if (pkgError || !pkg) {
    void logError('billing.subscriptions.packageRead', pkgError ?? 'package missing', {
      userId,
      details: { packageId: data.package_id },
    });
    console.error('[billing/subscriptions] package read failed:', pkgError);
    return null;
  }

  const coinFloor =
    pkg.coin_daily_floor === null ? null : Number(pkg.coin_daily_floor);

  return {
    id: data.id,
    userId: data.user_id,
    packageId: pkg.id,
    packageName: pkg.name,
    packageCode: pkg.code,
    coinDailyFloor: Number.isFinite(coinFloor as number) ? (coinFloor as number) : null,
    energyDailyFloor: pkg.energy_daily_floor,
    adsDisabled: pkg.ads_disabled,
    badgeLabel: pkg.badge_label,
    source: data.source,
    startedAt: data.started_at,
    expiresAt: data.expires_at,
  };
}

export type SubscriptionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Grants a subscription, replacing whatever the user currently holds.
 *
 * The existing active row is expired FIRST, in its own statement, because the
 * partial unique index (one active row per user) would otherwise reject the
 * insert. That ordering also means a failure leaves the user with NO
 * subscription rather than two — the safe direction for a mechanic that raises
 * floors.
 *
 * `days` overrides the package's own period; the package's period_days is the
 * default. Both are resolved server-side — no caller supplies a duration that
 * has not been validated here.
 */
export async function grantSubscription(
  userId: string,
  packageId: string,
  options: { days?: number | null; source?: string; providerSubscriptionId?: string | null } = {}
): Promise<SubscriptionResult<{ expiresAt: string }>> {
  const pkg = await getActivePackage(packageId);
  if (!pkg) return { ok: false, error: 'Paket tapılmadı və ya aktiv deyil' };
  if (pkg.kind !== 'subscription') return { ok: false, error: 'Bu paket abunə deyil' };

  const days = options.days ?? pkg.periodDays;
  if (!days || !Number.isFinite(days) || days <= 0) {
    return { ok: false, error: 'Müddət düzgün deyil' };
  }

  const admin = createAdminClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();

  const { error: expireError } = await admin
    .from('billing_subscriptions')
    .update({ status: 'expired', updated_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (expireError) {
    void logError('billing.subscriptions.expirePrevious', expireError, { userId });
    console.error('[billing/subscriptions] expiring previous subscription failed:', expireError);
    return { ok: false, error: 'Köhnə abunəni bağlamaq uğursuz oldu' };
  }

  const { error } = await admin.from('billing_subscriptions').insert({
    user_id: userId,
    package_id: packageId,
    status: 'active',
    source: options.source ?? 'admin',
    provider_subscription_id: options.providerSubscriptionId ?? null,
    started_at: now.toISOString(),
    expires_at: expiresAt,
  });

  if (error) {
    void logError('billing.subscriptions.grant', error, { userId, details: { packageId } });
    console.error('[billing/subscriptions] grantSubscription failed:', error);
    if (isMissingRelationError(error)) {
      return { ok: false, error: 'Abunə cədvəli yaradılmayıb (0102 migrasiyası icra edilməyib)' };
    }
    return { ok: false, error: 'Abunəni vermək uğursuz oldu' };
  }

  return { ok: true, data: { expiresAt } };
}

/** Ends the user's active subscription now. Idempotent. */
export async function cancelSubscription(userId: string): Promise<SubscriptionResult<null>> {
  const now = new Date().toISOString();
  const { error } = await createAdminClient()
    .from('billing_subscriptions')
    .update({ status: 'canceled', canceled_at: now, updated_at: now })
    .eq('user_id', userId)
    .eq('status', 'active');

  if (error) {
    void logError('billing.subscriptions.cancel', error, { userId });
    console.error('[billing/subscriptions] cancelSubscription failed:', error);
    return { ok: false, error: 'Abunəni ləğv etmək uğursuz oldu' };
  }

  return { ok: true, data: null };
}

export interface SubscriptionListRow {
  id: string;
  userId: string;
  email: string | null;
  packageName: string;
  status: string;
  source: string;
  startedAt: string;
  expiresAt: string;
}

/** Admin view: current subscriptions, newest first. */
export async function listSubscriptions(limit = 50): Promise<SubscriptionListRow[]> {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from('billing_subscriptions')
    .select('id, user_id, status, source, started_at, expires_at, billing_packages(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (isMissingRelationError(error)) return [];
    void logError('billing.subscriptions.list', error);
    console.error('[billing/subscriptions] listSubscriptions failed:', error);
    return [];
  }

  // Emails come from auth.users, which has no FK PostgREST can join through —
  // resolved in one batched admin lookup rather than one call per row.
  const rows = data as unknown as Array<{
    id: string;
    user_id: string;
    status: string;
    source: string;
    started_at: string;
    expires_at: string;
    billing_packages: { name: string } | { name: string }[] | null;
  }>;

  const emails = new Map<string, string | null>();
  await Promise.all(
    [...new Set(rows.map((r) => r.user_id))].map(async (id) => {
      try {
        const { data: user } = await admin.auth.admin.getUserById(id);
        emails.set(id, user?.user?.email ?? null);
      } catch {
        emails.set(id, null);
      }
    })
  );

  return rows.map((row) => {
    const pkg = Array.isArray(row.billing_packages) ? row.billing_packages[0] : row.billing_packages;
    return {
      id: row.id,
      userId: row.user_id,
      email: emails.get(row.user_id) ?? null,
      packageName: pkg?.name ?? '—',
      status: row.status,
      source: row.source,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    };
  });
}

/** Resolves an email to a user id for the admin grant form. */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return null;

  try {
    // listUsers is the only email lookup the admin API exposes; the page size is
    // capped because this is an admin-typed exact match, not a search feature.
    const { data, error } = await createAdminClient().auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return null;
    return data.users.find((u) => (u.email ?? '').toLowerCase() === trimmed)?.id ?? null;
  } catch {
    return null;
  }
}

export type { BillingPackage };
