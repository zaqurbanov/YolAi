import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDocument, reprocessDocument } from '@/lib/ingestion/ingestDocument';
import { apiError, notFound, serverError, logApiError } from '@/lib/api/errors';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';
import { isStaleProcessing } from '@/lib/ingestion/staleness';

export const maxDuration = 300;

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

// Storage keys must be ASCII-safe; Azerbaijani/Cyrillic/accented filenames
// (e.g. "778-IQ - Avtomobil yolları haqqında.pdf") make Supabase Storage
// reject the key with "Invalid key". The original name is preserved
// separately in documents.title, so it's safe to slug it here.
function slugifyFilename(name: string): string {
  const dotIndex = name.lastIndexOf('.');
  const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
  const ext = dotIndex > 0 ? name.slice(dotIndex + 1) : '';

  const slugBase = base
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();

  const slugExt = ext.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();

  return slugExt ? `${slugBase || 'file'}.${slugExt}` : slugBase || 'file';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createAdminClient();

  if (id) {
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
      .select('id, title, status, page_count, error_message, created_at, updated_at')
      .eq('id', id)
      .single();
    if (fetchError || !document) {
      return notFound('Sənəd tapılmadı');
    }
    const documentWithStale = { ...document, stale: isStaleProcessing(document.status, document.updated_at) };

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
      document: documentWithStale,
      chunkStats: { total, minLength, maxLength, avgLength, markerBased, fallback },
    });
  }

  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return serverError(error, 'Sənədləri yükləmək uğursuz oldu');
  const documents = data.map((doc) => ({
    ...doc,
    stale: isStaleProcessing(doc.status, doc.updated_at),
  }));
  return NextResponse.json({ documents });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
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

  const formData = await request.formData();
  const file = formData.get('file');
  const title = formData.get('title');

  if (!(file instanceof File) || typeof title !== 'string' || !title.trim()) {
    return apiError(400, 'file və title tələb olunur');
  }
  if (file.type !== 'application/pdf') {
    return apiError(400, 'Yalnız PDF fayllar qəbul olunur');
  }

  const supabase = createAdminClient();
  const storagePath = `${crypto.randomUUID()}-${slugifyFilename(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { contentType: 'application/pdf' });
  if (uploadError) return serverError(uploadError, 'Faylı yükləmək uğursuz oldu');

  const { data: document, error: insertError } = await supabase
    .from('documents')
    .insert({ title: title.trim(), storage_path: storagePath, uploaded_by: auth.userId })
    .select()
    .single();
  if (insertError) return serverError(insertError, 'Sənəd yaratmaq uğursuz oldu');

  // Fire-and-forget by design: the document row and upload already succeeded,
  // ingestion progress/failure is tracked via documents.status and surfaced through GET.
  try {
    await ingestDocument(document.id);
  } catch (err) {
    logApiError(`ingest document=${document.id}`, err);
  }

  return NextResponse.json({ document });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return apiError(400, 'id tələb olunur');

  const body = await request.json().catch(() => null);
  const title = body?.title;

  if (typeof title !== 'string' || !title.trim()) {
    return apiError(400, 'title tələb olunur');
  }

  const supabase = createAdminClient();
  const { data: document, error } = await supabase
    .from('documents')
    .update({ title: title.trim() })
    .eq('id', id)
    .select('id, title')
    .single();

  if (error || !document) return notFound('Sənəd tapılmadı');

  return NextResponse.json({ document });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const supabase = createAdminClient();

  if (id) {
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

  const body = await request.json().catch(() => null);
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return apiError(400, 'ids tələb olunur');
  }

  try {
    const { deletedCount } = await deleteDocuments(supabase, ids);
    return NextResponse.json({ ok: true, deleted: deletedCount });
  } catch (error) {
    return serverError(error, 'Sənədləri silmək uğursuz oldu');
  }
}
