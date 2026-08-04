import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SIGN_DOC_ID = "6d157672-7441-4062-8b5b-a3d3f59c0e0d";
async function main() {
  const { data: chunks } = await supabase.from("chunks").select("id, article_label, content, page_number").eq("document_id", SIGN_DOC_ID);
  const codes = (chunks ?? []).filter((c) => /^Kod\s+\d+(\.\d+)?$/i.test(String(c.article_label || "")));
  const { data: imgs } = await supabase.from("sign_images").select("code, position, storage_path").eq("document_id", SIGN_DOC_ID);
  const imgByCode = new Map();
  for (const i of imgs ?? []) if (i.position === 0 && !imgByCode.has(i.code)) imgByCode.set(i.code, i.storage_path);
  const withImg = [], withoutImg = [];
  for (const c of codes) {
    const digits = String(c.article_label).replace(/^Kod\s+/i, "").trim();
    if (imgByCode.has(digits)) withImg.push({ label: c.article_label, digits, content: String(c.content).replace(/\s+/g," ").slice(0,140) });
    else withoutImg.push({ label: c.article_label, digits, content: String(c.content).replace(/\s+/g," ").slice(0,140) });
  }
  console.log(`KOD CHUNKS: ${codes.length} | with image: ${withImg.length} | without: ${withoutImg.length}\n`);
  console.log("=== WITH IMAGE (code | description) ===");
  for (const w of withImg) console.log(`${w.label}\t${w.content}`);
  console.log("\n=== WITHOUT IMAGE ===");
  for (const w of withoutImg) console.log(`${w.label}\t${w.content}`);
  // image codes not present in chunk labels
  const chunkCodes = new Set(codes.map(c => String(c.article_label).replace(/^Kod\s+/i,"").trim()));
  const extra = [...imgByCode.keys()].filter(k => !chunkCodes.has(k)).sort();
  console.log(`\n=== IMAGE CODES WITHOUT CHUNK (${extra.length}) ===`);
  console.log(extra.join(", "));
}
main().catch((e) => { console.error("FAILED:", e?.stack ?? e); process.exit(1); });
