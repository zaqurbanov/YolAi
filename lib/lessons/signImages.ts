import 'server-only';
import { createClient } from '@/lib/supabase/server';

// Road-sign image support for lesson content.
//
// Lesson content (LLM-drafted, admin-reviewed) may embed sign images with the
// restricted marker `![nisan:1.20]` on its own line. The marker is a CODE,
// never a URL: URLs are resolved server-side from the live sign_images rows so
// the stored content stays portable and never bakes in a storage path.
//
// The same `sign-images` bucket and `sign_images` table feed the sign games
// (lib/coins/signPool.ts), so a lesson shows exactly the artwork the player
// already knows from "Nisan Sürəti" / "Nisan Tapmacası".

const MARKER_RE = /!\[nisan:([^\]]+)\]/g;

export function extractSignImageCodes(content: string): string[] {
  if (!content) return [];
  const codes: string[] = [];
  for (const match of content.matchAll(MARKER_RE)) {
    const raw = match[1].trim();
    // Accept both `![nisan:1.20]` and `![nisan:Kod 1.20]`.
    const code = raw.replace(/^Kod\s+/i, '').trim();
    if (code && !codes.includes(code)) codes.push(code);
  }
  return codes;
}

// Returns { code -> public URL } for the primary (position 0) image of each
// requested code in this document. Missing codes are simply absent from the
// map; the renderer shows a fallback, so a bad marker can never break a page.
export async function getSignImageUrls(
  documentId: string,
  codes: string[]
): Promise<Record<string, string>> {
  if (!documentId || codes.length === 0) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sign_images')
    .select('code, storage_path')
    .eq('document_id', documentId)
    .eq('position', 0)
    .in('code', codes);

  if (error || !data) return {};

  const urls: Record<string, string> = {};
  for (const row of data) {
    if (typeof row.code !== 'string' || typeof row.storage_path !== 'string') continue;
    urls[row.code] = supabase.storage.from('sign-images').getPublicUrl(row.storage_path).data.publicUrl;
  }
  return urls;
}
