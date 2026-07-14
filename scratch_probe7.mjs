import os from 'node:os';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');
const extractor = await pipeline('feature-extraction', 'Xenova/paraphrase-multilingual-MiniLM-L12-v2', { dtype: 'q8' });
async function embedText(text) { const o = await extractor(text, { pooling: 'mean', normalize: true }); return Array.from(o.data); }
const TARGET_CHUNK_ID = '0f82cf15-f825-48c8-9398-164484e173a0';
const SUPA_URL = process.env.SUPA_URL, SUPA_KEY = process.env.SUPA_KEY;

async function matchChunks(embQuery, ftsQuery, matchCount, docId) {
  const emb = await embedText(embQuery);
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query_embedding: emb, match_count: matchCount, filter_document_id: docId ?? null, query_text: ftsQuery, filter_document_ids: null }) });
  return res.json();
}

async function getReadyDocumentIds() {
  const res = await fetch(`${SUPA_URL}/rest/v1/documents?select=id&status=eq.ready`, { headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` } });
  return (await res.json()).map(d => d.id);
}

async function simulate(rewritten, raw, label) {
  const docIds = await getReadyDocumentIds();
  const primary = await matchChunks(rewritten, raw, 60, null);
  const rawResult = rewritten !== raw ? await matchChunks(raw, raw, 60, null) : [];
  // per-document top 20 each, embed with rewritten query (matches route.ts's retrievePerDocumentChunks(retrievalQuery, query))
  const perDocEmb = await embedText(rewritten);
  const perDocResults = [];
  for (const docId of docIds) {
    const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, { method: 'POST', headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query_embedding: perDocEmb, match_count: 20, filter_document_id: docId, query_text: raw, filter_document_ids: null }) });
    const data = await res.json();
    if (!Array.isArray(data)) { console.error('non-array for doc', docId, data); continue; }
    perDocResults.push(...data);
  }
  const seen = new Set(primary.map(c => c.id));
  const merged = [...primary];
  for (const source of [rawResult, perDocResults]) {
    for (const c of source) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      merged.push(c);
    }
  }
  merged.sort((a, b) => b.combined_score - a.combined_score);
  const capped = merged.slice(0, 220);
  const idx = capped.findIndex(c => c.id === TARGET_CHUNK_ID);
  const idxFull = merged.findIndex(c => c.id === TARGET_CHUNK_ID);
  console.log(label, '| merged pool size:', merged.length, '| target idx in full merged (sorted):', idxFull, '| target idx within capped-220:', idx, idx>=0 ? 'SURVIVES' : 'DROPPED');
}

await simulate(
  "avtomobilin dövlət qeydiyyat nişanı dəyişdikdə sığorta şəhadətnaməsinin yenilənməsi zərurəti sığorta qaydaları məcburi sığorta müqaviləsi",
  "Maşının nömrəsi dəyişib, sığortanı yenidən eləmək lazımdı?",
  "Q1"
);
await simulate(
  "avtomobil sığortası sığorta şirkəti seçimi sığorta şəhadətnaməsi məcburi sığorta qaydaları",
  "Maşını hansı sığorta şirkətində sığorta etdirməliyəm?",
  "Q2"
);
