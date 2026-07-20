import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers pulls in onnxruntime-node, which ships a native
  // libonnxruntime.so binary. Next.js's server-bundle tracing doesn't follow
  // native addons correctly unless the package is marked external — without
  // this, Vercel deploys throw "libonnxruntime.so.1: cannot open shared
  // object file" at runtime because the .so never gets copied into the
  // serverless function bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  // serverExternalPackages alone isn't enough on Vercel — Next's output file
  // tracer (@vercel/nft) still doesn't follow onnxruntime-node's native
  // binding to find libonnxruntime.so.1, since it's loaded via a dynamic
  // dlopen-style require, not a static import it can statically analyze.
  // Force-include the whole native binary directory for every API route.
  outputFileTracingIncludes: {
    // Native onnxruntime binding (dlopen'd, not statically analyzable by the tracer)
    // plus the vendored q8 embedding model weights/tokenizer (scripts/fetch-embedding-model.js)
    // so cold Vercel containers never hit the HF Hub over the network at request time.
    "/api/**/*": [
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
      "./models/**",
    ],
  },
  // serverExternalPackages disables tree-shaking for @huggingface/transformers, so
  // @vercel/nft falls back to its conservative default of tracing the package's
  // entire `files` manifest in package.json (which lists "src" and "types") instead
  // of just what's reachable from the actual runtime entry point
  // (`dist/transformers.node.cjs`, a self-contained esbuild bundle per the package's
  // own `main`/`exports` fields). That pulled ~471MB of unused `src/**` model
  // architecture source (every arch the library supports, not just the one
  // embedding model this app uses) into the deployed Lambda bundle — confirmed via
  // `.next/server/app/api/chat/route.js.nft.json`. Exclude it explicitly, plus other
  // runtime-irrelevant pieces: the browser/WASM dist build and onnxruntime-web (this
  // app is Node-only server-side, using onnxruntime-node's native binding).
  // NOTE: sharp was excluded here previously and must NOT be — even though this
  // app never calls it, dist/transformers.node.mjs statically imports sharp at
  // module load time (for vision-model image preprocessing this app doesn't
  // use), so excluding the package wholesale breaks embedText()/embedBatch()
  // at runtime with ERR_MODULE_NOT_FOUND on Vercel (confirmed live,
  // 2026-07-14 — POST /api/chat 500s in prod). It's a static import, not
  // conditionally require()'d, so there's no safe way to omit it.
  outputFileTracingExcludes: {
    "/api/**/*": [
      "./node_modules/@huggingface/transformers/src/**/*",
      "./node_modules/@huggingface/transformers/types/**/*",
      "./node_modules/@huggingface/transformers/dist/transformers.web.js",
      "./node_modules/@huggingface/transformers/dist/*.wasm",
      "./node_modules/onnxruntime-web/**/*",
    ],
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  async redirects() {
    return [
      { source: "/privacy", destination: "/faq/privacy", permanent: true },
      { source: "/terms", destination: "/faq/terms", permanent: true },
      {
        source: "/istifade-qaydalari",
        destination: "/faq/istifade-qaydalari",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
