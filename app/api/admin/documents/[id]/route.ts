import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, notFound, serverError } from '@/lib/api/errors';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';
import { reprocessDocument } from '@/lib/ingestion/ingestDocument';

export const maxDuration = 300;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const supabase = createAdminClient();

  const { searchParams } = new URL(request.url);
  if (searchParams.get('chunks') === '1') {
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', id)
      .single();
    if (fetchError || !document) {
      return notFound('Sənəd tapılmadı');
    }

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

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('id, title, status, page_count, error_message, created_at')
    .eq('id', id)
    .single();
  if (fetchError || !document) {
    return notFound('Sənəd tapılmadı');
  }

  // Pull content length + article_label per chunk (not the embedding column,
  // which is large and unused here) to derive split-strategy stats in-process
  // rather than adding a bespoke SQL aggregate for a one-off admin view.
  const { data: chunkRows, error: chunksError } = await supabase
    .from('chunks')
    .select('content, article_label')
    .eq('document_id', id);
  if (chunksError) return serverError(chunksError, 'Chunk statistikasını yükləmək uğursuz oldu');

  const total = chunkRows.length;
  let minLength = 0;
  let maxLength = 0;
  let avgLength = 0;
  let markerBased = 0;
  let fallback = 0;

  if (total > 0) {
    const lengths = chunkRows.map((c) => c.content?.length ?? 0);
    minLength = Math.min(...lengths);
    maxLength = Math.max(...lengths);
    avgLength = Math.round(lengths.reduce((sum, len) => sum + len, 0) / total);
    for (const c of chunkRows) {
      if (c.article_label !== null) markerBased += 1;
      else fallback += 1;
    }
  }

  return NextResponse.json({
    document,
    chunkStats: { total, minLength, maxLength, avgLength, markerBased, fallback },
  });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: document, error: fetchError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', id)
    .single();
  if (fetchError || !document) {
    return notFound('Sənəd tapılmadı');
  }

  try {
    await deleteDocuments(supabase, [id]);
  } catch (error) {
    return serverError(error, 'Sənədi silmək uğursuz oldu');
  }

  return NextResponse.json({ ok: true });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;

  // Unlike ingest-on-upload, this is fully awaited before responding (not a
  // detached background job), so a failure here should be surfaced to the
  // caller rather than returning a false ok:true.
  try {
    await reprocessDocument(id);
  } catch (err) {
    return serverError(err, 'Sənədi yenidən emal etmək uğursuz oldu');
  }

  return NextResponse.json({ ok: true });
}
