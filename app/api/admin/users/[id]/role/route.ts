import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { apiError, notFound, serverError } from '@/lib/api/errors';

// Only the two real role tiers are assignable through this API.
const ASSIGNABLE_ROLES = new Set(['admin', 'user']);

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
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

  // RLS-respecting client: relies on the profiles_update_admin policy
  // (0026_remove_super_admin.sql), which itself checks is_admin() — so this
  // update fails closed even if the requireAdmin() check above were ever
  // bypassed.
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
