import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePdf } from './parsePdf';
import { chunkPages } from './chunkText';
import { embedBatch } from '@/lib/embeddings/embed';
import { embedBatchGemini } from '@/lib/embeddings/gemini';

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
      console.error(
        `[ingest] document ${documentId} ingested with INCOMPLETE gemini embeddings (${geminiFailedBatches} batch(es) failed)`,
      );
    }

    await supabase
      .from('documents')
      .update({ status: 'ready', page_count: pages.length, error_message: geminiWarning })
      .eq('id', documentId);
  } catch (err) {
    const message = extractErrorMessage(err);
    await supabase.from('documents').update({ status: 'failed', error_message: message }).eq('id', documentId);
    throw err;
  }
}

export async function reprocessDocument(documentId: string) {
  const supabase = createAdminClient();
  await supabase.from('chunks').delete().eq('document_id', documentId);
  await ingestDocument(documentId);
}
