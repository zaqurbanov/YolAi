import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePdf } from './parsePdf';
import { chunkPages, type Chunk } from './chunkText';
import { embedBatch } from '@/lib/embeddings/embed';
import { embedBatchGemini } from '@/lib/embeddings/gemini';
import { logError } from '@/lib/logging/logError';
import { extractAndPersistSignImages, deleteSignImages } from './persistSignImages';

// A catalog document (e.g. the road-sign PDF) is the only kind that ever
// produces chunks via chunkText.ts's splitCodeCatalogEntries(), which tags
// every chunk it emits with an articleLabel of the form `Kod ${code}`. That
// tag is the signal used here to decide whether to run image extraction —
// deliberately reading chunkPages()'s output rather than changing its return
// shape, so this stays a zero-diff addition to chunkText.ts's public contract.
function isCatalogDocument(chunks: Chunk[]): boolean {
  return chunks.some((c) => c.articleLabel?.startsWith('Kod '));
}

// Supabase's PostgrestError/StorageError are plain objects with a `message`
// field, not `instanceof Error` — a bare `err instanceof Error` check (as
// this used to be) swallows their actual message and reports a useless
// "Unknown ingestion error" for the majority of real ingestion failures
// (storage download errors, chunk insert errors), which is exactly the class
// of error most likely to occur here.
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return 'Unknown ingestion error';
}

export async function ingestDocument(documentId: string) {
  const supabase = createAdminClient();

  const { data: document, error: docError } = await supabase
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !document) throw new Error('Document not found');

  try {
    await supabase.from('documents').update({ status: 'processing' }).eq('id', documentId);

    const { data: file, error: downloadError } = await supabase.storage
      .from('documents')
      .download(document.storage_path);
    if (downloadError || !file) throw downloadError ?? new Error('Download failed');

    const buffer = await file.arrayBuffer();
    const pages = await parsePdf(buffer);
    const chunks = chunkPages(pages);

    const BATCH_SIZE = 16;
    // Every chunk is embedded with BOTH providers so that switching
    // active_embedding_model is an instant flip rather than a corpus-wide
    // re-embed, and so no document is ever missing the inactive provider's
    // vectors (which would silently break retrieval for that document the
    // moment an admin toggles). The local model is the source of truth: if
    // Gemini fails, the document still ingests with `embedding` populated and
    // `embedding_gemini` null.
    let geminiFailedBatches = 0;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const contents = batch.map((c) => c.content);
      const embeddings = await embedBatch(contents);

      let geminiEmbeddings: number[][] | null = null;
      try {
        geminiEmbeddings = await embedBatchGemini(contents);
      } catch (err) {
        geminiFailedBatches += 1;
        void logError('ingest.geminiEmbedBatch', err, {
          details: { documentId, batchStartChunk: i },
        });
        console.error(
          `[ingest] gemini embedding failed for document ${documentId} batch starting at chunk ${i} — continuing with local embeddings only; run scripts/backfill-gemini-embeddings.mjs to repair:`,
          err,
        );
      }

      const rows = batch.map((chunk, j) => ({
        document_id: documentId,
        content: chunk.content,
        page_number: chunk.pageNumber,
        article_label: chunk.articleLabel,
        chunk_index: chunk.chunkIndex,
        embedding: embeddings[j],
        embedding_gemini: geminiEmbeddings?.[j] ?? null,
      }));

      const { error: insertError } = await supabase.from('chunks').insert(rows);
      if (insertError) throw insertError;
    }

    // Written to the document row, not just logged — a silent degradation
    // here is what would later make the admin toggle refuse to switch (or,
    // without the coverage guard, break retrieval outright). Status stays
    // 'ready' because the document IS fully usable on the active local model;
    // error_message carries the warning so it's visible in the admin UI.
    const geminiWarning =
      geminiFailedBatches > 0
        ? `Gemini embedding-lərinin ${geminiFailedBatches} paketi alınmadı — sənəd yerli model ilə tam işlək vəziyyətdədir, lakin Gemini-yə keçmək üçün backfill skripti işə salınmalıdır.`
        : null;
    if (geminiWarning) {
      void logError('ingest.geminiIncomplete', 'Document ingested with incomplete gemini embeddings', {
        details: { documentId, geminiFailedBatches },
      });
      console.error(
        `[ingest] document ${documentId} ingested with INCOMPLETE gemini embeddings (${geminiFailedBatches} batch(es) failed)`,
      );
    }

    await supabase
      .from('documents')
      .update({ status: 'ready', page_count: pages.length, error_message: geminiWarning })
      .eq('id', documentId);

    // Image extraction is additive metadata for catalog documents only
    // (road-sign PDFs, detected via the `Kod ` articleLabel signal above) —
    // it must never be able to fail the ingest. extractAndPersistSignImages
    // already swallows its own errors (logError + console.error) and simply
    // returns without throwing; text ingestion above has already committed
    // and the document is already 'ready' by the time this runs.
    if (isCatalogDocument(chunks)) {
      await extractAndPersistSignImages(documentId, buffer);
    }
  } catch (err) {
    const message = extractErrorMessage(err);
    // The documents row already carries error_message for the admin UI; this
    // keeps the full stack/cause, which that column doesn't hold.
    await logError('ingest.document', err, { details: { documentId } });
    await supabase.from('documents').update({ status: 'failed', error_message: message }).eq('id', documentId);
    throw err;
  }
}

export async function reprocessDocument(documentId: string) {
  const supabase = createAdminClient();
  await supabase.from('chunks').delete().eq('document_id', documentId);
  // Clean up unconditionally, not just when the document is still a catalog
  // document post-reprocess: extractAndPersistSignImages (called from
  // ingestDocument, below) already does its own delete-first re-extraction
  // for the still-catalog case, but if a chunking-strategy change means this
  // document no longer trips the catalog signal, that call never runs and
  // stale rows/objects from a prior run would otherwise survive untouched.
  await deleteSignImages(documentId);
  await ingestDocument(documentId);
}
