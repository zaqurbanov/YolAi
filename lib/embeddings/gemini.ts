import 'server-only';
import { google } from '@ai-sdk/google';
import { embed, embedMany } from 'ai';

// Second, toggleable embedding provider alongside the local in-process model
// in embed.ts. Which one is live is decided by the `active_embedding_model`
// app_settings key (see activeModel.ts) — NOT by LLM_PROVIDER, which is a
// separate axis owned exclusively by lib/llm/index.ts and must not be
// entangled with this one.
//
// Reuses GOOGLE_GENERATIVE_AI_API_KEY, already present for chat fallback and
// vision. @ai-sdk/google reads it from the environment itself.
const MODEL_ID = 'gemini-embedding-001';

// pgvector's hnsw/ivfflat indexes cap at 2000 dims, so the model's full 3072
// output could never be indexed. 1536 is the largest indexable Matryoshka
// truncation and must stay in lockstep with `chunks.embedding_gemini
// vector(1536)` (0058).
const OUTPUT_DIMENSIONALITY = 1536;

// Gemini's taskType is the direct equivalent of E5's "query: "/"passage: "
// prefix asymmetry in embed.ts — the query and the document it should match
// are embedded with different instructions, and omitting the distinction
// measurably degrades retrieval. This mirrors embed.ts's embedText (queries)
// vs embedBatch (passages) split exactly.
function providerOptions(taskType: 'RETRIEVAL_QUERY' | 'RETRIEVAL_DOCUMENT') {
  return { google: { outputDimensionality: OUTPUT_DIMENSIONALITY, taskType } };
}

export async function embedTextGemini(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: google.embedding(MODEL_ID),
    value: text,
    providerOptions: providerOptions('RETRIEVAL_QUERY'),
  });
  return embedding;
}

export async function embedBatchGemini(texts: string[]): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: google.embedding(MODEL_ID),
    values: texts,
    providerOptions: providerOptions('RETRIEVAL_DOCUMENT'),
  });
  return embeddings;
}
