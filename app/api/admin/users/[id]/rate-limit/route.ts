import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError } from '@/lib/api/errors';

// Sane upper bound to reject fat-fingered values (e.g. 9999999) — chosen
// well above any realistic legitimate per-user daily cap.
const MAX_ALLOWED = 100000;

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const customMaxPerDay = body?.customMaxPerDay;

  if (
    customMaxPerDay !== null &&
    customMaxPerDay !== undefined &&
    (typeof customMaxPerDay !== 'number' ||
      !Number.isInteger(customMaxPerDay) ||
      customMaxPerDay <= 0 ||
      customMaxPerDay > MAX_ALLOWED)
  ) {
    return apiError(400, `customMaxPerDay null və ya 1-${MAX_ALLOWED} arasında tam ədəd olmalıdır`);
  }

  const value = customMaxPerDay ?? null;

  const supabase = await createClient();

  // RLS-respecting client: relies on the profiles_update_admin policy
  // (0026_remove_super_admin.sql), which itself checks is_admin() — same
  // pattern as app/api/admin/users/[id]/role/route.ts.
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ custom_max_per_day: value })
    .eq('id', id)
    .select('id, custom_max_per_day')
    .maybeSingle();

  if (error) return serverError(error, 'Limiti dəyişmək uğursuz oldu');
  if (!profile) return notFound('İstifadəçi tapılmadı');

  return NextResponse.json({ profile });
}
