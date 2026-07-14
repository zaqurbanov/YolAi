import os from 'node:os';
import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';

env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const extractor = await pipeline('feature-extraction', MODEL_ID, { dtype: 'q8' });

async function embedText(text) {
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

const queries = {
  q1_raw: "Maşının nömrəsi dəyişib, sığortanı yenidən eləmək lazımdı?",
  q2_raw: "Maşını hansı sığorta şirkətində sığorta etdirməliyəm?",
};

const SUPA_URL = process.env.SUPA_URL;
const SUPA_KEY = process.env.SUPA_KEY;

for (const [name, q] of Object.entries(queries)) {
  const emb = await embedText(q);
  const res = await fetch(`${SUPA_URL}/rest/v1/rpc/match_chunks`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query_embedding: emb,
      match_count: 60,
      filter_document_id: null,
      query_text: q,
      filter_document_ids: null,
    }),
  });
  const data = await res.json();
  const targetIdx = data.findIndex((c) => c.document_id === 'b5b06739-ab7b-472e-af31-6747039eeaa7');
  console.log(name, 'candidates:', data.length, 'target chunk rank (0-based, -1=absent):', targetIdx, targetIdx>=0 ? data[targetIdx].article_label : null);
}
