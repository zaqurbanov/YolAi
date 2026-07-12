import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createClient } from '@/lib/supabase/server';
import { apiError, serverError } from '@/lib/api/errors';

// User-scoped client, not createAdminClient() — the existing
// chat_request_logs_select_admin RLS policy (0007) already permits admin
// SELECT, so service-role is unnecessary here on top of requireAdmin().
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { messageId } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('chat_request_logs')
    .select('rewrite_ms, embed_ms, db_search_ms, llm_first_token_ms, llm_total_ms, used_fallback, model_used, created_at')
    .eq('message_id', messageId)
    .maybeSingle();

  if (error) return serverError(error, 'Vaxt ölçmələrini yükləmək uğursuz oldu');

  // No matching row is an expected, non-error case (messages created before
  // this feature shipped, or a best-effort log insert that failed) — return
  // 200 with `log: null` rather than 404, so the frontend doesn't need to
  // special-case a "missing resource" status for what's normal, not broken.
  return NextResponse.json({ log: data ?? null });
}
