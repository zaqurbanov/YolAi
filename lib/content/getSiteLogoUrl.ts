import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Duplicated from app/api/admin/chat-meta/route.ts's local
// SITE_LOGO_SETTING_KEY rather than imported — that route doesn't export it,
// and this file shouldn't depend on the internals of an unrelated route file
// (same precedent as lib/content/homeBackground.ts).
const SITE_LOGO_SETTING_KEY = 'site_logo_url';

// Server-side read for server components (e.g. NavBar/Sidebar) — mirrors the
// GET ?type=logo branch in app/api/admin/chat-meta/route.ts, querying
// app_settings directly via the service-role client instead of an extra
// network hop through the API route. Returns null when no admin override is
// configured or the query fails, both of which mean "fall back to the
// default logo".
export async function getSiteLogoUrl(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', SITE_LOGO_SETTING_KEY)
    .maybeSingle();

  if (error) return null;
  return typeof data?.value === 'string' ? data.value : null;
}
