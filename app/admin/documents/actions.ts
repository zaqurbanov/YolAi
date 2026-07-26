'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractAndPersistSignImages } from '@/lib/ingestion/persistSignImages';
import { logError } from '@/lib/logging/logError';

export interface ReextractSignImagesResult {
  ok: boolean;
  error?: string;
}

// Re-runs ONLY sign-image extraction for an already-ingested document, not a
// full text re-chunk/re-embed — useful for picking up an extraction-logic
// improvement without touching chunks/embeddings. The existing "Yenidən
// emal et" button (DocumentDetail.tsx) already re-runs image extraction as
// a side effect of a full reprocess via reprocessDocument() -> ingestDocument()
// -> extractAndPersistSignImages(); this action exists for the narrower case.
//
// Idempotent: extractAndPersistSignImages deletes this document's prior
// sign_images rows + storage objects before re-inserting, so calling this
// repeatedly is safe and never collides with the
// unique(document_id, code, position) constraint.
//
// Does NOT check whether the document is actually a catalog document before
// running — extractSignImages() on a non-catalog PDF just won't find any
// `code`-shaped text near any images and returns an empty array, which is a
// harmless no-op here (a stale set of catalog rows still gets cleared, which
// is correct behavior either way).
export async function reextractSignImagesAction(documentId: string): Promise<ReextractSignImagesResult> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, error: admin.message };

  const supabase = createAdminClient();
  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('storage_path')
    .eq('id', documentId)
    .single();

  if (docError || !document) return { ok: false, error: 'Sənəd tapılmadı' };

  const { data: file, error: downloadError } = await supabase.storage
    .from('documents')
    .download(document.storage_path);

  if (downloadError || !file) {
    void logError('admin.reextractSignImages.download', downloadError ?? new Error('download failed'), {
      details: { documentId },
    });
    return { ok: false, error: 'Sənədi yükləmək uğursuz oldu' };
  }

  const buffer = await file.arrayBuffer();
  // extractAndPersistSignImages never throws (see its own contract comment)
  // — a failure inside it is already logged there; from the caller's side
  // this call always "succeeds" in the sense of not throwing, so the
  // deliberately narrow signal here is whether the document/download steps
  // above succeeded.
  await extractAndPersistSignImages(documentId, buffer);

  revalidatePath(`/admin/documents/${documentId}`);
  return { ok: true };
}
