import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminUserConversations } from '@/lib/admin/getUserDetail';
import { apiError, notFound, serverError } from '@/lib/api/errors';
import { getChatModelId } from '@/lib/llm';
import { GLOBAL_DEFAULT_SETTING_KEY, ENV_DEFAULT_MAX_PER_WINDOW } from '@/lib/chat/rateLimit';
import {
  COIN_PRICE_SETTING_KEY,
  DEFAULT_MESSAGE_PRICE,
  DAILY_COIN_GRANT_SETTING_KEY,
  DEFAULT_DAILY_LIMIT,
} from '@/lib/chat/coins';

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — same
// convention as app/api/admin/users/[id]/rate-limit/route.ts.
const MAX_ALLOWED = 100000;

// Coin price is numeric(10,2) and explicitly allowed to be fractional (e.g.
// 0.5/message) — bounds chosen to reject fat-fingered values while still
// allowing sub-1 prices, unlike MAX_ALLOWED above which is integer-only.
const MAX_ALLOWED_PRICE = 10000;

const DEFAULT_USER_CONVERSATIONS_LIMIT = 10;
const MAX_USER_CONVERSATIONS_LIMIT = 50;

// Only the two real role tiers are assignable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

// Coin values are numeric(10,2) and explicitly allowed to be fractional
// (e.g. 0.5 grant) — bounds chosen only to reject fat-fingered input.
const MAX_ALLOWED_DAILY_COIN_LIMIT = 100000;
const MAX_ALLOWED_COIN_GRANT = 100000;

const BUSY_PHRASE_STAGES = ['analyzing', 'rewriting', 'searching', 'finalizing', 'streaming'] as const;
type BusyPhraseStage = (typeof BUSY_PHRASE_STAGES)[number];

function isBusyPhraseStage(value: unknown): value is BusyPhraseStage {
  return typeof value === 'string' && (BUSY_PHRASE_STAGES as readonly string[]).includes(value);
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

  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  if (type === 'model') {
    return NextResponse.json({ modelId: getChatModelId() });
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
      return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');
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

  return apiError(400, 'type parametri düzgün deyil');
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

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

  if (type === 'user') {
    const id = searchParams.get('id');
    if (!id) return apiError(400, 'id tələb olunur');

    const body = await request.json().catch(() => null);
    const hasRole = body?.role !== undefined;
    const hasDailyCoinLimit = body?.dailyCoinLimit !== undefined;
    const hasGrantCoins = body?.grantCoins !== undefined;

    if (!hasRole && !hasDailyCoinLimit && !hasGrantCoins) {
      return apiError(400, 'role, dailyCoinLimit və ya grantCoins göndərilməlidir');
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

    return NextResponse.json({ profile, coins });
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
