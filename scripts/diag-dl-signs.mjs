import { createClient } from "@supabase/supabase-js";
import https from "node:https";
import fs from "node:fs";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const SIGN_DOC_ID = "6d157672-7441-4062-8b5b-a3d3f59c0e0d";
const codes = ["5.22", "5.23", "5.24", "5.25"];
async function main() {
  const { data } = await supabase.from("sign_images").select("code, storage_path").eq("document_id", SIGN_DOC_ID).eq("position", 0).in("code", codes);
  for (const code of codes) {
    const row = (data ?? []).find(r => r.code === code);
    if (!row) { console.log(code, "NO IMAGE"); continue; }
    const url = supabase.storage.from("sign-images").getPublicUrl(row.storage_path).data.publicUrl;
    const out = `D:/YOL/.qa-tmp/sign-${code.replace(".", "_")}.png`;
    await new Promise((resolve) => {
      https.get(url, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => { fs.writeFileSync(out, Buffer.concat(chunks)); console.log(code, url, "->", out); resolve(); });
      }).on("error", (e) => { console.log(code, "ERR", e.message); resolve(); });
    });
  }
}
main();
