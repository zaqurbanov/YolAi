import 'server-only';
import { createClient } from '@/lib/supabase/server';

export interface AdminUserRow {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
}

// Assumes the caller has already run requireAdmin() — this is a plain
// data-fetcher, no auth check here. Relies on the profiles_select_admin RLS
// policy (0009_admin_read_policies.sql) to see rows beyond the caller's own.
export async function getAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return data ?? [];
}
