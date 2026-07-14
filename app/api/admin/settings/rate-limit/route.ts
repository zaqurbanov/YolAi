import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, serverError } from '@/lib/api/errors';
import { GLOBAL_DEFAULT_SETTING_KEY, ENV_DEFAULT_MAX_PER_WINDOW } from '@/lib/chat/rateLimit';

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — same
// convention as app/api/admin/users/[id]/rate-limit/route.ts.
const MAX_ALLOWED = 100000;

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

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

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

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
