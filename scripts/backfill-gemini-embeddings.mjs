// One-off maintenance script: fills `chunks.embedding_gemini` (added in
// 0058_gemini_embeddings.sql) for every row that doesn't have it yet, using
// Google's gemini-embedding-001 at outputDimensionality=1536. Does NOT
// re-chunk or touch `content`/`id`/`embedding` — the local e5-small vectors
// stay exactly as they are, and the app keeps serving from them until an
// admin explicitly flips active_embedding_model to 'gemini'.
//
// PREREQUISITE: 0058_gemini_embeddings.sql must already be applied, otherwise
// every update fails with "column embedding_gemini does not exist".
//
// RESUMABLE BY DESIGN: only selects rows where embedding_gemini is null, so
// re-running after an interrupted/stalled run picks up exactly where it left
// off and never re-pays for work already done. (An earlier long-running
// embedding job in this project stalled partway with no way to resume, which
// is why this is a hard requirement and not a nicety.) Because processed rows
// stop matching the filter, this pages from offset 0 every time rather than
// advancing an offset — advancing one would skip rows as the result set
// shrinks underneath it.
//
// Bypasses lib/embeddings/gemini.ts's `import 'server-only'` guard (which
// throws outside the Next.js server runtime) by calling the AI SDK directly
// here, mirroring that module's model id, dimensionality and taskType
// (RETRIEVAL_DOCUMENT for chunk content — must match, or the backfilled
// vectors won't be comparable to query vectors).
//
// Run manually, not wired into package.json:
//   node --env-file=.env.local scripts/backfill-gemini-embeddings.mjs
//
// Cost: ~$0.07 for the current ~2009-chunk corpus at $0.15/1M tokens.

import { createClient } from "@supabase/supabase-js";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { embedMany } from "ai";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_API_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or GOOGLE_GENERATIVE_AI_API_KEY — run with `node --env-file=.env.local scripts/backfill-gemini-embeddings.mjs`"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const google = createGoogleGenerativeAI({ apiKey: GOOGLE_API_KEY });

// Must stay in lockstep with lib/embeddings/gemini.ts and the vector(1536)
// column in 0058.
const MODEL_ID = "gemini-embedding-001";
const OUTPUT_DIMENSIONALITY = 1536;

const PAGE_SIZE = 100;
const EMBED_BATCH_SIZE = 20;

async function main() {
  const startedAt = Date.now();

  const { count: totalCount, error: totalError } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true });
  if (totalError) throw new Error(`Failed to count chunks: ${totalError.message}`);

  const { count: remainingCount, error: remainingError } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding_gemini", null);
  if (remainingError) throw new Error(`Failed to count remaining chunks: ${remainingError.message}`);

  console.log(
    `[backfill-gemini] ${totalCount} chunks total, ${remainingCount} still missing embedding_gemini (${
      totalCount - remainingCount
    } already done — resuming)`
  );

  let processed = 0;
  let pageNumber = 0;

  while (true) {
    // Always range(0, PAGE_SIZE-1): rows drop out of this filtered set as
    // they're filled, so a moving offset would skip unprocessed rows.
    const { data: rows, error } = await supabase
      .from("chunks")
      .select("id, content")
      .is("embedding_gemini", null)
      .order("id", { ascending: true })
      .range(0, PAGE_SIZE - 1);

    if (error) throw new Error(`Failed to fetch chunks page ${pageNumber}: ${error.message}`);
    if (!rows || rows.length === 0) break;

    pageNumber += 1;

    for (let i = 0; i < rows.length; i += EMBED_BATCH_SIZE) {
      const batch = rows.slice(i, i + EMBED_BATCH_SIZE);

      const { embeddings } = await embedMany({
        model: google.embedding(MODEL_ID),
        values: batch.map((row) => row.content),
        providerOptions: {
          google: { outputDimensionality: OUTPUT_DIMENSIONALITY, taskType: "RETRIEVAL_DOCUMENT" },
        },
      });

      for (let j = 0; j < batch.length; j += 1) {
        const { error: updateError } = await supabase
          .from("chunks")
          .update({ embedding_gemini: embeddings[j] })
          .eq("id", batch[j].id);

        if (updateError) {
          throw new Error(`Failed to update chunk ${batch[j].id}: ${updateError.message}`);
        }
        processed += 1;
      }
    }

    console.log(
      `[backfill-gemini] page ${pageNumber}: ${processed}/${remainingCount} chunks embedded — elapsed ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(1)}s`
    );
  }

  const { count: stillMissing } = await supabase
    .from("chunks")
    .select("id", { count: "exact", head: true })
    .is("embedding_gemini", null);

  const elapsedMs = Date.now() - startedAt;
  console.log("=".repeat(80));
  console.log(`[backfill-gemini] DONE — chunks embedded this run: ${processed}`);
  console.log(`[backfill-gemini] chunks still missing embedding_gemini: ${stillMissing ?? "unknown"}`);
  console.log(
    `[backfill-gemini] total elapsed: ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / 60000).toFixed(2)} min)`
  );
  if (stillMissing === 0) {
    console.log("[backfill-gemini] coverage is 100% — the admin toggle will now allow switching to Gemini.");
  }
  console.log("=".repeat(80));
}

main().catch((err) => {
  console.error("[backfill-gemini] FAILED:", err && err.stack ? err.stack : err);
  console.error("[backfill-gemini] safe to re-run — completed rows are skipped.");
  process.exit(1);
});
