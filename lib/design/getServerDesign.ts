import { cookies } from 'next/headers';
import { DEFAULT_DESIGN, DESIGN_COOKIE_NAME, type Design } from './constants';

// Server-side counterpart to lib/design/useAppDesign.ts's client toggle.
// Every one of the 8 pages that render a DesignSwitch calls this before
// deciding which tree to build, so the correct simple/3D tree is what the
// server actually sends on the FIRST response — no client-side swap, no
// flash. Mirrors lib/supabase/server.ts's `await cookies()` usage (this is
// Next.js 16 — cookies() is async, see AGENTS.md).
export async function getServerDesign(): Promise<Design> {
  const cookieStore = await cookies();
  const value = cookieStore.get(DESIGN_COOKIE_NAME)?.value;
  return value === 'simple' ? 'simple' : DEFAULT_DESIGN;
}
