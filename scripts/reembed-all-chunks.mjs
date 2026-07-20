// One-off maintenance script: re-embeds every row in `chunks` with the new
// Xenova/multilingual-e5-small model (swapped in from
// Xenova/paraphrase-multilingual-MiniLM-L12-v2, both 384-dim — no schema
// change). Does NOT re-chunk or touch `content`/`id`, only `embedding`.
//
// Bypasses lib/embeddings/embed.ts's `import 'server-only'` guard (which
// throws outside the Next.js server runtime) by calling
// @huggingface/transformers directly here, mirroring embed.ts's prefixing
// convention (`passage: ` for chunk content, matching embedBatch).
//
// Run manually, not wired into package.json:
//   node --env-file=.env.local scripts/reembed-all-chunks.mjs
//
// Meant to be deleted after use, but left in place for now in case a re-run
// or double-check is needed.

import { createClient } from "@supabase/supabase-js";
import { pipeline } from "@huggingface/transformers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — run with `node --env-file=.env.local scripts/reembed-all-chunks.mjs`"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const PAGE_SIZE = 300;

async function main() {
  const startedAt = Date.now();

  console.log("[reembed] loading Xenova/multilingual-e5-small (q8) ...");
  const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", {
    dtype: "q8",
  });
  console.log(`[reembed] model loaded in ${Date.now() - startedAt}ms`);

  let processed = 0;
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data: rows, error } = await supabase
      .from("chunks")
      .select("id, content")
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Failed to fetch chunks page [${from}, ${to}]: ${error.message}`);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const output = await extractor(`passage: ${row.content}`, {
        pooling: "mean",
        normalize: true,
      });
      const embedding = Array.from(output.data);

      const { error: updateError } = await supabase
        .from("chunks")
        .update({ embedding })
        .eq("id", row.id);

      if (updateError) {
        throw new Error(`Failed to update chunk ${row.id}: ${updateError.message}`);
      }

      processed += 1;
    }

    console.log(
      `[reembed] processed ${processed} chunks so far (page [${from}, ${to}], ${rows.length} rows) — elapsed ${(
        (Date.now() - startedAt) /
        1000
      ).toFixed(1)}s`
    );

    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const elapsedMs = Date.now() - startedAt;
  console.log("=".repeat(80));
  console.log(`[reembed] DONE — total chunks re-embedded: ${processed}`);
  console.log(`[reembed] total elapsed: ${(elapsedMs / 1000).toFixed(1)}s (${(elapsedMs / 60000).toFixed(2)} min)`);
  console.log("=".repeat(80));
}

main().catch((err) => {
  console.error("[reembed] FAILED:", err && err.stack ? err.stack : err);
  process.exit(1);
});
