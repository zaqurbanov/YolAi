import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';
import { extractSignImages } from './extractSignImages';

const SIGN_IMAGES_BUCKET = 'sign-images';

function storagePathFor(documentId: string, code: string, position: number): string {
  return `${documentId}/${code.replace(/\./g, '_')}_${position}.png`;
}

// Shared by the ingest-time call in ingestDocument.ts and the manual
// admin re-run action (app/admin/documents/actions.ts) — both need the same
// "wipe this document's prior sign_images + storage objects, then
// re-extract and upsert" behaviour, so a re-run after an extraction-logic
// change (or a reprocess) never collides with the
// unique(document_id, code, position) constraint or leaves stale rows.
//
// CONTRACT: like logError, this never throws. It's on the ingest hot path
// (called from inside ingestDocument's try block, after text ingestion has
// already succeeded and the document is already 'ready') and must not be
// able to turn image extraction into a text-ingestion failure. Every
// failure path here logs via logError + console.error and returns.
export async function extractAndPersistSignImages(
  documentId: string,
  pdfBuffer: ArrayBuffer,
): Promise<void> {
  const supabase = createAdminClient();

  try {
    // Delete-first rather than upsert-only: an extraction-logic change can
    // shrink the set of codes/positions produced for this document (e.g. a
    // pairing fix that removes a spurious duplicate), and upsert alone would
    // never clean up rows/objects that are no longer produced.
    const { data: existing } = await supabase
      .from('sign_images')
      .select('storage_path')
      .eq('document_id', documentId);

    if (existing && existing.length > 0) {
      await supabase.storage
        .from(SIGN_IMAGES_BUCKET)
        .remove(existing.map((row) => row.storage_path));
    }
    await supabase.from('sign_images').delete().eq('document_id', documentId);

    const images = await extractSignImages(pdfBuffer);

    // v1 only persists `kind: 'sign'`. Detection still needs to see marking
    // entries to know where the sign section ends and avoid corrupting sign
    // numbering, but marking's code collisions and one-image-multiple-codes
    // cases aren't safe to store 1:1 in this schema yet — future work, not
    // silently dropped by accident.
    const signOnlyImages = images.filter((img) => img.kind === 'sign');

    const BATCH_SIZE = 16;
    for (let i = 0; i < signOnlyImages.length; i += BATCH_SIZE) {
      const batch = signOnlyImages.slice(i, i + BATCH_SIZE);

      const rows = await Promise.all(
        batch.map(async (img) => {
          const storagePath = storagePathFor(documentId, img.code, img.position);
          const { error: uploadError } = await supabase.storage
            .from(SIGN_IMAGES_BUCKET)
            .upload(storagePath, img.png, { contentType: 'image/png', upsert: true });
          if (uploadError) throw uploadError;

          return {
            code: img.code,
            kind: img.kind,
            document_id: documentId,
            page: img.page,
            position: img.position,
            storage_path: storagePath,
            width: img.width,
            height: img.height,
          };
        }),
      );

      const { error: insertError } = await supabase.from('sign_images').insert(rows);
      if (insertError) throw insertError;
    }
  } catch (err) {
    void logError('ingest.signImages', err, { details: { documentId } });
    console.error(`[ingest] sign image extraction failed for document ${documentId} — text ingestion is unaffected:`, err);
  }
}

// Deletes prior sign_images rows + their storage objects for a document,
// without re-extracting. Used by reprocessDocument() before a full
// re-ingest so stale rows never survive under the old extraction logic
// (extractAndPersistSignImages will re-populate them itself if the
// reprocessed document is still a catalog document).
export async function deleteSignImages(documentId: string): Promise<void> {
  const supabase = createAdminClient();
  try {
    const { data: existing } = await supabase
      .from('sign_images')
      .select('storage_path')
      .eq('document_id', documentId);

    if (existing && existing.length > 0) {
      await supabase.storage
        .from(SIGN_IMAGES_BUCKET)
        .remove(existing.map((row) => row.storage_path));
    }
    await supabase.from('sign_images').delete().eq('document_id', documentId);
  } catch (err) {
    void logError('ingest.deleteSignImages', err, { details: { documentId } });
    console.error(`[ingest] failed to clean up prior sign_images for document ${documentId}:`, err);
  }
}
