import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { parsePdf } from './parsePdf';
import { chunkPages } from './chunkText';
import { embedBatch } from '@/lib/embeddings/embed';

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
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const embeddings = await embedBatch(batch.map((c) => c.content));

      const rows = batch.map((chunk, j) => ({
        document_id: documentId,
        content: chunk.content,
        page_number: chunk.pageNumber,
        article_label: chunk.articleLabel,
        chunk_index: chunk.chunkIndex,
        embedding: embeddings[j],
      }));

      const { error: insertError } = await supabase.from('chunks').insert(rows);
      if (insertError) throw insertError;
    }

    await supabase
      .from('documents')
      .update({ status: 'ready', page_count: pages.length, error_message: null })
      .eq('id', documentId);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown ingestion error';
    await supabase.from('documents').update({ status: 'failed', error_message: message }).eq('id', documentId);
    throw err;
  }
}

export async function reprocessDocument(documentId: string) {
  const supabase = createAdminClient();
  await supabase.from('chunks').delete().eq('document_id', documentId);
  await ingestDocument(documentId);
}
