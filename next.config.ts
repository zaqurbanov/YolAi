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
    "/api/**/*": ["./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**"],
  },
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
