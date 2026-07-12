import 'server-only';
import os from 'node:os';
import path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// Serverless runtimes (Vercel) ship a read-only filesystem except /tmp — the
// library's default cache dir lives under node_modules and fails to mkdir there.
env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline('feature-extraction', MODEL_ID) as Promise<FeatureExtractionPipeline>;
  }
  return extractorPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const embeddings: number[][] = [];
  for (const text of texts) {
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    embeddings.push(Array.from(output.data as Float32Array));
  }
  return embeddings;
}
