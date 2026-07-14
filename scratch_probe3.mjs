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
const SUPA_URL = process.env.SUPA_URL, SUPA_KEY = process.env.SUPA_KEY;
async function search(embQuery, ftsQuery, matchCount, documentIds) {
  const emb = await embedText(embQuery);
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query_embedding: emb, match_count: matchCount, filter_document_id: null, query_text: ftsQuery, filter_document_ids: documentIds ?? null }),
  });
  return res.json();
}
const rewritten = "avtomobilin dövlət qeydiyyat nişanı dəyişdikdə sığorta şəhadətnaməsinin yenilənməsi zərurəti sığorta qaydaları məcburi sığorta müqaviləsi";
const raw = "Maşının nömrəsi dəyişib, sığortanı yenidən eləmək lazımdı?";
const data = await search(rewritten, raw, 60, null);
console.log('rewritten-primary(60) target rank:', data.findIndex(c=>c.id===TARGET_CHUNK_ID));
const data2 = await search(raw, raw, 60, null);
console.log('raw-primary(60) target rank:', data2.findIndex(c=>c.id===TARGET_CHUNK_ID));
