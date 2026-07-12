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
    // Serverless (Vercel) cold starts re-download the model on every fresh
    // container — quantized (q8) ONNX weights are ~4x smaller than the
    // default fp32 weights (~120MB vs ~470MB), cutting both download and
    // load time substantially. Retrieval quality loss from int8 quantization
    // is negligible for this use case (semantic similarity search, not
    // generation).
    extractorPromise = pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
    }) as Promise<FeatureExtractionPipeline>;
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
