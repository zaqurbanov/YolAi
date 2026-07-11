import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, notFound, serverError } from '@/lib/api/errors';

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id')
    .eq('id', id)
    .single();
  if (fetchError || !document) {
    return notFound('Sənəd tapılmadı');
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get('pageSize')) || DEFAULT_PAGE_SIZE)
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const {
    data: chunks,
    error,
    count,
  } = await supabase
    .from('chunks')
    .select('id, content, page_number, article_label, chunk_index', { count: 'exact' })
    .eq('document_id', id)
    .order('chunk_index', { ascending: true })
    .range(from, to);

  if (error) return serverError(error, 'Chunk-ları yükləmək uğursuz oldu');

  return NextResponse.json({ chunks, total: count ?? 0, page, pageSize });
}
