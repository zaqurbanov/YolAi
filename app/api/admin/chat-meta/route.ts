import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, serverError } from '@/lib/api/errors';
import { getChatModelId } from '@/lib/llm';
import { GLOBAL_DEFAULT_SETTING_KEY, ENV_DEFAULT_MAX_PER_WINDOW } from '@/lib/chat/rateLimit';
import { COIN_PRICE_SETTING_KEY, DEFAULT_MESSAGE_PRICE } from '@/lib/chat/coins';

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — same
// convention as app/api/admin/users/[id]/rate-limit/route.ts.
const MAX_ALLOWED = 100000;

// Coin price is numeric(10,2) and explicitly allowed to be fractional (e.g.
// 0.5/message) — bounds chosen to reject fat-fingered values while still
// allowing sub-1 prices, unlike MAX_ALLOWED above which is integer-only.
const MAX_ALLOWED_PRICE = 10000;

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
