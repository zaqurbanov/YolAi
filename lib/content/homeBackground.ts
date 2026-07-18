import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Duplicated from app/api/admin/chat-meta/route.ts's local
// HOME_BACKGROUND_SETTING_KEY rather than imported — that route doesn't
// export it, and this file shouldn't depend on the internals of an
// unrelated route file (same precedent as that route's own
// slugifyAssetFilename duplication comment).
const HOME_BACKGROUND_SETTING_KEY = 'home_background_image_url';

// Server-side read for app/page.tsx (a server component) — mirrors the
// GET ?type=background-image branch in app/api/admin/chat-meta/route.ts,
// querying app_settings directly via the service-role client instead of the
// page fetching its own API route (an unnecessary network hop for a value
// needed at render time). Returns null when no admin override is configured
// or the query fails, both of which mean "fall back to the static /bg.png".
export async function getHomeBackgroundImageUrl(): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .from('app_settings')
    .select('value')
    .eq('key', HOME_BACKGROUND_SETTING_KEY)
    .maybeSingle();

  if (error) return null;
  return typeof data?.value === 'string' ? data.value : null;
}
