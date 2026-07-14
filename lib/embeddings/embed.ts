import 'server-only';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

const MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

// Serverless runtimes (Vercel) ship a read-only filesystem except /tmp — the
// library's default cache dir lives under node_modules and fails to mkdir there.
env.cacheDir = path.join(os.tmpdir(), 'transformers-cache');

// scripts/fetch-embedding-model.js vendors the q8 ONNX weights + tokenizer at
// install/build time into `models/`, which outputFileTracingIncludes forces
// into the deployed function bundle (next.config.ts) — this avoids the ~22s
// HF Hub download that otherwise happens on every cold Vercel container.
// Guarded by existsSync so local dev / CI still works before the fetch
// script has run (or if it failed non-fatally): falls back to the previous
// allowRemoteModels=true behavior, downloading into env.cacheDir instead.
const VENDORED_MODEL_DIR = path.join(process.cwd(), 'models');
const VENDORED_MODEL_FILE = path.join(VENDORED_MODEL_DIR, MODEL_ID, 'onnx', 'model_quantized.onnx');

if (existsSync(VENDORED_MODEL_FILE)) {
  env.allowRemoteModels = false;
  env.localModelPath = VENDORED_MODEL_DIR + path.sep;
  console.log(
    `[embeddings] vendored local model found — using local weights, allowRemoteModels=false (${VENDORED_MODEL_FILE})`
  );
} else {
  console.log(
    `[embeddings] VENDORED MODEL NOT FOUND at ${VENDORED_MODEL_FILE} (cwd=${process.cwd()}) — falling back to remote HuggingFace Hub download (cold start will be slow, ~15-20s)`
  );
}

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
    const startedAt = Date.now();
    console.log('[embeddings] pipeline() load starting');
    globalForEmbeddings.__yolExtractorPromise = (
      pipeline('feature-extraction', MODEL_ID, {
        dtype: 'q8',
      }) as Promise<FeatureExtractionPipeline>
    ).then((extractor) => {
      console.log(`[embeddings] pipeline() load finished in ${Date.now() - startedAt}ms`);
      return extractor;
    });
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
