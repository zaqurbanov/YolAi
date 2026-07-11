import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, notFound, serverError } from '@/lib/api/errors';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { id } = await params;
  const supabase = createAdminClient();

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
