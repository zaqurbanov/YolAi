import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ingestDocument } from '@/lib/ingestion/ingestDocument';
import { apiError, serverError, logApiError } from '@/lib/api/errors';
import { deleteDocuments } from '@/lib/documents/deleteDocuments';

export const maxDuration = 300;

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

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return serverError(error, 'Sənədləri yükləmək uğursuz oldu');
  return NextResponse.json({ documents: data });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

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

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return apiError(auth.status, auth.message);

  const body = await request.json().catch(() => null);
  const ids = body?.ids;

  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === 'string')) {
    return apiError(400, 'ids tələb olunur');
  }

  const supabase = createAdminClient();

  try {
    const { deletedCount } = await deleteDocuments(supabase, ids);
    return NextResponse.json({ ok: true, deleted: deletedCount });
  } catch (error) {
    return serverError(error, 'Sənədləri silmək uğursuz oldu');
  }
}
