import { rewriteQuery } from '@/lib/rag/rewriteQuery';
import { retrieveRelevantChunks, findDocumentIdByTitle } from '@/lib/retrieval/search';

async function main() {
  const query = 'maşını atamnan almışam hələ adıma keçirməmişəm texniki baxışa apara bilərəm?';

  const docId = await findDocumentIdByTitle(
    '%texniki baxışının keçirilməsi qaydaları%'
  );
  console.log('resolved doc id (may be null if ilike wildcard not supported by helper):', docId);

  const retrievalQuery = await rewriteQuery(query);
  console.log('rewritten query:', retrievalQuery);

  const { chunks } = await retrieveRelevantChunks({
    embedQuery: retrievalQuery,
    ftsQuery: query,
    matchCount: 20,
  });

  console.log(`\nTop ${chunks.length} chunks:`);
  chunks.forEach((c, i) => {
    console.log(
      `${i + 1}. doc="${c.document_title}" page=${c.page_number} article_label=${JSON.stringify(
        c.article_label
      )} sim=${c.similarity?.toFixed(4)} trgm_rank=${c.trgm_rank} vector_rank=${c.vector_rank} combined=${c.combined_score?.toFixed(4)}`
    );
    if (c.document_title?.includes('texniki baxış')) {
      console.log('   content preview:', c.content.slice(0, 200).replace(/\n/g, ' '));
    }
  });
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
