import os from 'node:os';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');
const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });
async function embedText(text) {
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

const TARGET_CHUNK_ID = '0f82cf15-f825-48c8-9398-164484e173a0';
const DOC_ID = 'b5b06739-ab7b-472e-af31-6747039eeaa7';

const queries = {
  q1_raw: "Maşının nömrəsi dəyişib, sığortanı yenidən eləmək lazımdı?",
  q2_raw: "Maşını hansı sığorta şirkətində sığorta etdirməliyəm?",
};

const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_KEY;

async function search(embQuery, ftsQuery, matchCount, documentIds) {
  const emb = await embedText(embQuery);
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: emb, match_count: matchCount, filter_document_id: null, query_text: ftsQuery, filter_document_ids: documentIds ?? null }),
  });
  return res.json();
}

for (const [name, q] of Object.entries(queries)) {
  const data = await search(q, q, 60, null);
  const idx = data.findIndex((c) => c.id === TARGET_CHUNK_ID);
  const docChunks = data.filter((c) => c.document_id === DOC_ID).map((c) => c.article_label);
  console.log(name, '| primary(60) target-chunk rank:', idx, '| doc chunks in pool:', docChunks.length, docChunks);
}
