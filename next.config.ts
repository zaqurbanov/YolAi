import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @huggingface/transformers pulls in onnxruntime-node, which ships a native
  // libonnxruntime.so binary. Next.js's server-bundle tracing doesn't follow
  // native addons correctly unless the package is marked external — without
  // this, Vercel deploys throw "libonnxruntime.so.1: cannot open shared
  // object file" at runtime because the .so never gets copied into the
  // serverless function bundle.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
};

export default nextConfig;
