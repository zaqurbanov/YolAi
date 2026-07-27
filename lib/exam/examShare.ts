import 'server-only';
import { cache } from 'react';
import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// Share link generation/read for a completed exam result. Mirrors
// lib/chat/getSharedConversation.ts's philosophy exactly: service-role client
// (bypasses RLS by design — there is no anonymous RLS policy on
// exam_sessions), but safe because the read is always an exact share_token
// equality match and the returned shape carries no user_id or any other
// user-identifying field.

export async function generateExamShareLink(
  userId: string,
  sessionId: string
): Promise<string | null> {
  const token = randomBytes(24).toString('base64url');

  // Only a completed (used=true) session belonging to this user can be
  // shared — fail closed on anything else (in-progress, someone else's
  // session, or a bad id).
  const { data, error } = await createAdminClient()
    .from('exam_sessions')
    .update({ share_token: token })
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('used', true)
    .select('id')
    .maybeSingle();

  if (error || !data) return null;

  return token;
}

export interface SharedExamResult {
  score: number;
  total: number;
  completedAt: string;
}

export const getSharedExamResult = cache(async function getSharedExamResult(
  token: string
): Promise<SharedExamResult | null> {
  if (!token) return null;

  const { data, error } = await createAdminClient()
    .from('exam_sessions')
    .select('score, total, issued_at')
    .eq('share_token', token)
    .maybeSingle();

  if (error || !data || typeof data.score !== 'number') return null;

  return {
    score: data.score,
    total: data.total,
    completedAt: data.issued_at,
  };
});
