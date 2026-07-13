import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { getAdminUserConversations } from '@/lib/admin/getUserDetail';
import { apiError, serverError } from '@/lib/api/errors';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(searchParams.get('limit')) || DEFAULT_LIMIT));
  const offset = Math.max(0, Number(searchParams.get('offset')) || 0);

  try {
    const page = await getAdminUserConversations(id, { limit, offset });
    return NextResponse.json(page);
  } catch (error) {
    return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');
  }
}
