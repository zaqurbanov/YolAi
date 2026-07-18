import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Real registered-user count for the home page's public social-proof line
// and stats block. Uses the service-role client rather than the RLS-scoped
// one because RLS only lets admins count every `profiles` row
// (0009_admin_read_policies.sql) — but a total headcount isn't sensitive (no
// PII, just a number), so it's safe to compute for anonymous visitors here.
export async function getRegisteredDriverCount(): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

  if (error) {
    console.error('[getRegisteredDriverCount] failed:', error);
    return 0;
  }

  return count ?? 0;
}

// A few real users' initials for the hero's avatar-stack chips — same
// privacy posture as the count above (a single uppercase letter isn't PII),
// pulled from the most recently registered profiles so the stack has some
// natural variety instead of always showing the same 3 people. Falls back to
// email's first character when full_name is empty, same derivation
// `initialsFrom` in app/account/page.tsx uses for the avatar fallback.
export async function getRecentDriverInitials(limit = 3): Promise<string[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('full_name, email')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) {
    if (error) console.error('[getRecentDriverInitials] failed:', error);
    return [];
  }

  return data
    .map((row) => (row.full_name?.trim()?.[0] ?? row.email?.trim()?.[0] ?? '').toUpperCase())
    .filter(Boolean);
}
