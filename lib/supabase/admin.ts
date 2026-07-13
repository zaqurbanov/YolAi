import 'server-only';
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// Cached on `globalThis` (survives dev-mode HMR reloads, same rationale as
// lib/embeddings/embed.ts) and reused across calls within a process instead
// of constructing a fresh supabase-js client per request. Note this is a
// minor win, not the fix for the ~2.3s match_chunks latency measured in
// chat_request_timing logs: supabase-js talks to Supabase over PostgREST
// (plain HTTPS requests), not a persistent Postgres connection, so there is
// no connection-pool warm-up being skipped here — each RPC call is still an
// independent HTTPS round trip to the remote Supabase host regardless
// (NEXT_PUBLIC_SUPABASE_URL is a hosted *.supabase.co project, not
// localhost). Reusing the client object avoids repeated construction
// overhead (building the fetch wrapper/headers) but will not materially
// change round-trip time, which is dominated by network latency plus the
// RPC's own query-plan cost (see 0018's widened candidate pool, which trades
// a small amount of extra scan cost for retrieval recall).
const globalForSupabaseAdmin = globalThis as typeof globalThis & {
  __yolSupabaseAdminClient?: SupabaseClient;
};

export function createAdminClient() {
  if (!globalForSupabaseAdmin.__yolSupabaseAdminClient) {
    globalForSupabaseAdmin.__yolSupabaseAdminClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
  }
  return globalForSupabaseAdmin.__yolSupabaseAdminClient;
}
