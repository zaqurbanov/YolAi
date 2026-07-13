import 'server-only';
import os from 'node:os';
import path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// Serverless runtimes (Vercel) ship a read-only filesystem except /tmp — the
// library's default cache dir lives under node_modules and fails to mkdir there.
env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');

// Cached on `globalThis`, not a plain module-level `let`, so the pipeline
// survives Next.js dev-mode module reloads (Turbopack HMR re-evaluates this
// module's top-level scope on file changes anywhere in its dependency graph,
// which would otherwise silently reset extractorPromise to null and force a
// full model reload on the next request even though nothing about embed.ts
// itself changed). In production route-handler processes the module is only
// evaluated once per process regardless, so this is a no-op there — this is
// a dev-environment correctness fix, not a claim that the measured ~3.2s
// embed latency (see chat_request_timing logs) was caused by cache misses;
// that cost is the inherent first-use q8 MiniLM CPU inference/model-load
// time and is expected to only pay once per warm process either way.
const globalForEmbeddings = globalThis as typeof globalThis & {
  __yolExtractorPromise?: Promise<FeatureExtractionPipeline>;
};

function getExtractor() {
  if (!globalForEmbeddings.__yolExtractorPromise) {
    // Serverless (Vercel) cold starts re-download the model on every fresh
    // container — quantized (q8) ONNX weights are ~4x smaller than the
    // default fp32 weights (~120MB vs ~470MB), cutting both download and
    // load time substantially. Retrieval quality loss from int8 quantization
    // is negligible for this use case (semantic similarity search, not
    // generation).
    globalForEmbeddings.__yolExtractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
    }) as Promise<FeatureExtractionPipeline>;
  }
  return globalForEmbeddings.__yolExtractorPromise;
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
