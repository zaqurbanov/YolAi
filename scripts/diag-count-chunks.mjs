import { createClient } from "@supabase/supabase-js";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { count, error } = await supabase.from("chunks").select("*", { count: "exact", head: true });
if (error) { console.error(error); process.exit(1); }
console.log("total chunks:", count);
