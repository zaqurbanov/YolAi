import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SIGN_DOC_ID = "6d157672-7441-4062-8b5b-a3d3f59c0e0d";
async function main() {
  const { data: chunks } = await supabase.from("chunks").select("id, article_label, content, page_number").eq("document_id", SIGN_DOC_ID);
  const codes = (chunks ?? []).filter((c) => /^Kod\s+\d+(\.\d+)?$/i.test(String(c.article_label || "")));
  const { data: imgs } = await supabase.from("sign_images").select("code, position, storage_path").eq("document_id", SIGN_DOC_ID);
  const imgByCode = new Map();
  for (const i of imgs ?? []) if (i.position === 0 && !imgByCode.has(i.code)) imgByCode.set(i.code, i.storage_path);
  const rows = codes.map((c) => {
    const label = String(c.article_label).trim();
    const digits = label.replace(/^Kod\s+/i, "").trim();
    return {
      code: digits,
      label,
      page: c.page_number,
      content: String(c.content).replace(/\s+/g, " ").trim(),
      chunkId: c.id,
      hasImage: imgByCode.has(digits),
    };
  });
  fs.writeFileSync("D:/YOL/.qa-tmp/sign-catalog-full.json", JSON.stringify(rows, null, 1), "utf8");
  console.log("rows:", rows.length, "| with image:", rows.filter(r => r.hasImage).length, "| no image:", rows.filter(r => !r.hasImage).length);
  // print full content of all with-image rows, grouped, so I can author content accurately
  for (const r of rows) console.log(`${r.hasImage ? "IMG" : "---"}\t${r.label}\tp${r.page}\t${r.content}`);
}
main().catch((e) => { console.error("FAILED:", e?.stack ?? e); process.exit(1); });
