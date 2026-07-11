import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { apiError } from '@/lib/api/errors';
import { getChatModelId } from '@/lib/llm';

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  return NextResponse.json({ modelId: getChatModelId() });
}
