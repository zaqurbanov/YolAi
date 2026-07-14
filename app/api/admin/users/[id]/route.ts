import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUserConversations } from '@/lib/admin/getUserDetail';
import { apiError, notFound, serverError } from '@/lib/api/errors';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

// Only the two real role tiers are assignable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — chosen
// well above any realistic legitimate per-user daily cap.
const MAX_ALLOWED_RATE_LIMIT = 100000;

// Coin values are numeric(10,2) and explicitly allowed to be fractional
// (e.g. 0.5 grant), unlike MAX_ALLOWED_RATE_LIMIT above which is
// integer-only — bounds chosen only to reject fat-fingered input.
const MAX_ALLOWED_DAILY_COIN_LIMIT = 100000;
const MAX_ALLOWED_COIN_GRANT = 100000;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  try {
    const page = await getAdminUserConversations(id, { limit, offset });
    return NextResponse.json(page);
  } catch (error) {
    return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const hasRole = body?.role !== undefined;
  const hasRateLimit = body?.customMaxPerDay !== undefined;
  const hasDailyCoinLimit = body?.dailyCoinLimit !== undefined;
  const hasGrantCoins = body?.grantCoins !== undefined;

  if (!hasRole && !hasRateLimit && !hasDailyCoinLimit && !hasGrantCoins) {
    return apiError(400, 'role, customMaxPerDay, dailyCoinLimit və ya grantCoins göndərilməlidir');
  }

  // dailyCoinLimit/grantCoins are handled separately below (they write to
  // user_coins via the service-role client, not profiles via the
  // RLS-respecting one) — validated up front here so a bad value in either
  // field fails the whole request before any write happens, same
  // all-or-nothing validation posture as role/customMaxPerDay below.
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

  const update: { role?: string; custom_max_per_day?: number | null } = {};

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

  if (hasRateLimit) {
    const customMaxPerDay = body.customMaxPerDay;
    if (
      customMaxPerDay !== null &&
      (typeof customMaxPerDay !== 'number' ||
        !Number.isInteger(customMaxPerDay) ||
        customMaxPerDay <= 0 ||
        customMaxPerDay > MAX_ALLOWED_RATE_LIMIT)
    ) {
      return apiError(400, `customMaxPerDay null və ya 1-${MAX_ALLOWED_RATE_LIMIT} arasında tam ədəd olmalıdır`);
    }
    update.custom_max_per_day = customMaxPerDay ?? null;
  }

  const supabase = await createClient();

  let profile: { id: string; role: string; custom_max_per_day: number | null } | null;

  if (hasRole || hasRateLimit) {
    // RLS-respecting client: relies on the profiles_update_admin policy
    // (0026_remove_super_admin.sql), which itself checks is_admin() — so this
    // update fails closed even if the requireAdmin() check above were ever
    // bypassed.
    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', id)
      .select('id, role, custom_max_per_day')
      .maybeSingle();

    if (error) return serverError(error, 'İstifadəçini yeniləmək uğursuz oldu');
    profile = data;
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, custom_max_per_day')
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

  return NextResponse.json({ profile, coins });
}
