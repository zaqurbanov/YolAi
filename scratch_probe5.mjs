import os from 'node:os';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');
const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });
async function embedText(text) { const o = await extractor(text, { pooling: 'mean', normalize: true }); return Array.from(o.data); }
const TARGET_CHUNK_ID = '0f82cf15-f825-48c8-9398-164484e173a0';
const SUPA_URL = process.env.SUPA_URL, SUPA_KEY = process.env.SUPA_KEY;
async function search(embQuery, ftsQuery, matchCount) {
  const emb = await embedText(embQuery);
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query_embedding: emb, match_count: matchCount, filter_document_id: null, query_text: ftsQuery, filter_document_ids: null }) });
  return res.json();
}
const rewritten1 = "avtomobilin dövlət qeydiyyat nişanı dəyişdikdə sığorta şəhadətnaməsinin yenilənməsi zərurəti sığorta qaydaları məcburi sığorta müqaviləsi";
const raw1 = "Maşının nömrəsi dəyişib, sığortanı yenidən eləmək lazımdı?";
for (const mc of [60, 100, 150, 200]) {
  const d = await search(rewritten1, raw1, mc);
  console.log('Q1 rewritten mc='+mc, 'rank:', d.findIndex(c=>c.id===TARGET_CHUNK_ID), 'total:', d.length);
}
