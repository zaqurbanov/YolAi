// Standalone diagnostic — NOT part of the app, delete after use.
// Sanity-checks retrieval quality after the e5-small embedding swap by
// embedding a handful of Azerbaijani test queries ("query: " prefix,
// mirroring embed.ts's embedText) and calling the match_chunks RPC directly
// against the live Supabase project.
//
// Run: node --env-file=.env.local scripts/diag-verify-retrieval.mjs

import { createClient } from "@supabase/supabase-js";
import { pipeline } from "@huggingface/transformers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DOCUMENT_ID = "0e89deb3-a9ef-4b74-94cf-ff79a74027c8";

const QUERIES = [
  { label: "disabled-parking (diacritics)", text: "Əlil dayanacağında icazəsiz dayanmağa görə cərimə nə qədərdir?", targetArticle: "346-1.3" },
  { label: "disabled-parking (rephrase 2)", text: "İnvalidlər üçün nəzərdə tutulmuş yerdə qanunsuz park etmə cəzası", targetArticle: "346-1.3" },
  { label: "disabled-parking (no diacritics)", text: "Elil dayanacaginda icazesiz dayanmaga gore cerime ne qeder", targetArticle: "346-1.3" },
  { label: "drunk-driving (regression)", text: "Sərxoş vəziyyətdə avtomobil idarə etməyə görə cərimə nədir?", targetArticle: "333.1" },
];

async function main() {
  console.log("[diag] loading Xenova/multilingual-e5-small (q8) ...");
  const extractor = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8" });

  for (const q of QUERIES) {
    const output = await extractor(`query: ${q.text}`, { pooling: "mean", normalize: true });
    const embedding = Array.from(output.data);

    const { data, error } = await supabase.rpc("match_chunks", {
      query_embedding: embedding,
      match_count: 15,
      filter_document_id: null,
      query_text: q.text,
    });

    if (error) {
      console.error(`[diag] RPC error for "${q.label}":`, error.message);
      continue;
    }

    console.log("\n" + "=".repeat(80));
    console.log(`[diag] Query: "${q.label}" -> "${q.text}"`);
    console.log(`[diag] Target article: ${q.targetArticle} (document ${DOCUMENT_ID})`);
    console.log("-".repeat(80));

    let targetRank = null;
    data.forEach((row, i) => {
      const isTarget =
        row.document_id === DOCUMENT_ID &&
        typeof row.article_label === "string" &&
        row.article_label.includes(q.targetArticle);
      if (isTarget && targetRank === null) targetRank = i + 1;
      const marker = isTarget ? " <== TARGET" : "";
      console.log(
        `  #${i + 1} article=${row.article_label ?? "?"} similarity=${row.similarity?.toFixed(4)} combined=${row.combined_score?.toFixed(4)} doc=${row.document_title}${marker}`
      );
    });

    console.log(`[diag] Target rank: ${targetRank ?? "NOT IN TOP 15"}`);
  }
}

main().catch((err) => {
  console.error("[diag] FAILED:", err && err.stack ? err.stack : err);
  process.exit(1);
});
