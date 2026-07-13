import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError } from '@/lib/api/errors';

// 'super_admin' is intentionally not an allowed target here — granting it
// stays a manual DB-only operation (see supabase/migrations/0020_super_admin.sql)
// so privilege escalation is never reachable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const role = body?.role;

  if (typeof role !== 'string' || !ASSIGNABLE_ROLES.has(role)) {
    return apiError(400, "role 'admin' və ya 'user' olmalıdır");
  }

  if (id === auth.userId) {
    return apiError(400, 'Öz rolunuzu bu yolla dəyişə bilməzsiniz');
  }

  const supabase = await createClient();

  // RLS-respecting client: relies on the profiles_update_super_admin policy
  // (0020_super_admin.sql), which itself checks is_super_admin() — so this
  // update fails closed even if the requireSuperAdmin() check above were
  // ever bypassed.
  const { data: profile, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', id)
    .select('id, role')
    .maybeSingle();

  if (error) return serverError(error, 'Rolu dəyişmək uğursuz oldu');
  if (!profile) return notFound('İstifadəçi tapılmadı');

  return NextResponse.json({ profile });
}
