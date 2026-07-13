import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, status: 401 as const, message: 'Giriş tələb olunur' };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[requireAdmin] profiles query failed', error);
    return { ok: false as const, status: 500 as const, message: 'Server xətası' };
  }

  if (profile?.role !== 'admin' && profile?.role !== 'super_admin')
    return { ok: false as const, status: 403 as const, message: 'İcazə yoxdur' };

  return { ok: true as const, userId: user.id, role: profile.role as 'admin' | 'super_admin' };
}

export async function requireSuperAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false as const, status: 401 as const, message: 'Giriş tələb olunur' };

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('[requireSuperAdmin] profiles query failed', error);
    return { ok: false as const, status: 500 as const, message: 'Server xətası' };
  }

  if (profile?.role !== 'super_admin')
    return { ok: false as const, status: 403 as const, message: 'İcazə yoxdur' };

  return { ok: true as const, userId: user.id };
}
