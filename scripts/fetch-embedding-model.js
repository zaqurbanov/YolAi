// Vendors the embedding model's q8 ONNX weights + tokenizer files into
// `models/` at build/install time, so the deployed serverless function bundle
// never needs to hit the HF Hub at runtime (that network fetch was the
// dominant cost of cold-start latency on Vercel — ~22s measured on a real
// chat request). Pinned to a fixed revision so a fresh clone always
// reproduces the same bytes; bump REVISION deliberately, don't track `main`.
//
// Idempotent: skips files that are already present with a non-zero size, so
// repeated `npm install`/build runs (and Vercel's install-step cache) don't
// re-download ~130MB every time.
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const { Readable } = require("node:stream");

const MODEL_ID = "Xenova/multilingual-e5-small";
// Pinned commit sha for MODEL_ID on huggingface.co (not "main") — keeps the
// vendored weights reproducible across machines and over time.
const REVISION = "761b726dd34fb83930e26aab4e9ac3899aa1fa78";

// Must match exactly what lib/embeddings/embed.ts requests via `pipeline(...,
// { dtype: 'q8' })` — @huggingface/transformers maps dtype "q8" to the
// "_quantized" file suffix, i.e. `onnx/model_quantized.onnx`, not
// `onnx/model.onnx` (that's the full fp32 weights, ~4x larger).
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_quantized.onnx"];

const MODEL_DIR = path.join(__dirname, "..", "models", MODEL_ID);

// The real onnx/model_quantized.onnx is ~112.8MB. A plain "size > 0"
// existence check is too weak: a truncated/corrupted partial download (e.g.
// a network error that still wrote a few KB before failing) would pass that
// check and get silently skipped forever on every subsequent run, poisoning
// the vendored model without ever re-attempting the download.
const MIN_VALID_SIZE_BYTES = {
  "onnx/model_quantized.onnx": 80_000_000,
};

function isValidExistingFile(destPath, relPath) {
  if (!fs.existsSync(destPath)) return false;
  const { size } = fs.statSync(destPath);
  const minSize = MIN_VALID_SIZE_BYTES[relPath] ?? 1;
  return size >= minSize;
}

async function downloadFile(relPath) {
  const destPath = path.join(MODEL_DIR, relPath);

  if (isValidExistingFile(destPath, relPath)) {
    console.log(`[fetch-embedding-model] skip (already present): ${relPath}`);
    return;
  }

  if (fs.existsSync(destPath)) {
    console.warn(
      `[fetch-embedding-model] existing ${relPath} failed size sanity check — treating as corrupt/truncated, re-downloading`
    );
    await fsp.rm(destPath, { force: true });
  }

  await fsp.mkdir(path.dirname(destPath), { recursive: true });

  const url = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/${relPath}`;
  console.log(`[fetch-embedding-model] downloading ${relPath} ...`);

  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }

  const tmpPath = `${destPath}.tmp`;
  const fileStream = fs.createWriteStream(tmpPath);
  await new Promise((resolve, reject) => {
    Readable.fromWeb(res.body).pipe(fileStream).on("finish", resolve).on("error", reject);
  });
  await fsp.rename(tmpPath, destPath);

  const { size } = await fsp.stat(destPath);

  const minSize = MIN_VALID_SIZE_BYTES[relPath];
  if (minSize && size < minSize) {
    await fsp.rm(destPath, { force: true });
    throw new Error(
      `Downloaded ${relPath} is only ${size} bytes, expected at least ${minSize} — truncated/corrupted download, deleted`
    );
  }

  console.log(`[fetch-embedding-model] done: ${relPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);
}

async function main() {
  for (const relPath of FILES) {
    await downloadFile(relPath);
  }
}

main().catch((err) => {
  console.error("=".repeat(80));
  console.error("[fetch-embedding-model] FAILED — vendored embedding model was NOT downloaded.");
  console.error("[fetch-embedding-model] Deployed cold starts will fall back to a slow");
  console.error("[fetch-embedding-model] runtime download from the HuggingFace Hub (~15-20s).");
  console.error(`[fetch-embedding-model] Error: ${err && err.stack ? err.stack : err}`);
  console.error("=".repeat(80));
  // Non-fatal: embed.ts falls back to runtime remote download (env.allowRemoteModels)
  // when the vendored files aren't present, so don't fail the whole install/build
  // over a transient network error fetching the vendored copy.
  process.exit(0);
});
