// Standalone diagnostic — NOT part of the app, delete after use.
// Confirms the exact article_label values for the two regression test chunks
// referenced in the reembedding verification plan.
//
// Run: node --env-file=.env.local scripts/diag-find-target-chunks.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const DOCUMENT_ID = "0e89deb3-a9ef-4b74-94cf-ff79a74027c8";

async function main() {
  for (const pattern of ["%346-1.3%", "%333.1%"]) {
    const { data, error } = await supabase
      .from("chunks")
      .select("id, article_label, page_number, content")
      .eq("document_id", DOCUMENT_ID)
      .ilike("article_label", pattern);

    if (error) {
      console.error(`Error for pattern ${pattern}:`, error.message);
      continue;
    }
    console.log(`\nPattern ${pattern}: ${data.length} rows`);
    for (const row of data) {
      console.log(`  id=${row.id} article_label=${row.article_label} page=${row.page_number}`);
      console.log(`    content: ${row.content.slice(0, 150).replace(/\n/g, " ")}...`);
    }
  }
}

main().catch((err) => {
  console.error("FAILED:", err && err.stack ? err.stack : err);
  process.exit(1);
});
