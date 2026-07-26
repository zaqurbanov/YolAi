import 'server-only';
import { logError } from '@/lib/logging/logError';
import { createAdminClient } from '@/lib/supabase/admin';

// Question pool for "Nişan Sürəti" (sign speed quiz) — sourced from the
// already-ingested "Yol Nişanları" document, whose chunks are one-sign-per-row
// (article_label = "Kod X.Y", content = the official description) thanks to
// chunkText.ts's splitCodeCatalogEntries(). No LLM call, no new content: every
// option shown to the user is a literal quote from the ingested corpus.
// See docs/sign-speed-game-plan.md for the full rationale.

const SIGN_DOCUMENT_TITLE = 'Yol Nişanları';

// Tunable: only clean, single-sentence descriptions fit a timed multiple-choice
// UI. ~176/216 entries are under 120 chars; 150 gives a little headroom.
const MAX_DESCRIPTION_LENGTH = 150;

const CODE_PATTERN = /^Kod\s+\d+(\.\d+)?$/i;

export interface SignPoolEntry {
  code: string;
  description: string;
  // Public URL of the primary (position = 0) image for this code in
  // sign_images, when one exists. Not every code has an extracted image, so
  // this is never a hard requirement — the game must still work without it.
  imageUrl?: string;
}

// Module-level in-process cache — the pool only changes when an admin
// re-ingests the "Yol Nişanları" document, so re-querying it on every
// round-start would be pure waste. Short TTL so a re-ingest is picked up
// without a deploy.
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: { data: SignPoolEntry[]; expiresAt: number } | null = null;

async function fetchSignPool(): Promise<SignPoolEntry[]> {
  const supabase = createAdminClient();

  const { data: doc, error: docError } = await supabase
    .from('documents')
    .select('id')
    .eq('title', SIGN_DOCUMENT_TITLE)
    .maybeSingle();

  if (docError) void logError('coins.signPool.documentLookup', docError);
  if (docError || !doc) return [];

  const { data: chunks, error: chunksError } = await supabase
    .from('chunks')
    .select('article_label, content')
    .eq('document_id', doc.id);

  if (chunksError) void logError('coins.signPool.chunksRead', chunksError, { details: { documentId: doc.id } });
  if (chunksError || !chunks) return [];

  const { data: images, error: imagesError } = await supabase
    .from('sign_images')
    .select('code, storage_path')
    .eq('document_id', doc.id)
    .eq('position', 0);

  if (imagesError) void logError('coins.signPool.imagesRead', imagesError, { details: { documentId: doc.id } });

  const imageByCode = new Map<string, string>();
  if (images) {
    for (const row of images) {
      if (typeof row.code === 'string' && typeof row.storage_path === 'string') {
        imageByCode.set(row.code.trim(), row.storage_path);
      }
    }
  }

  const seen = new Set<string>();
  const pool: SignPoolEntry[] = [];

  for (const row of chunks) {
    const code = typeof row.article_label === 'string' ? row.article_label.trim() : '';
    let description = typeof row.content === 'string' ? row.content.trim() : '';

    if (!code || !description) continue;
    if (!CODE_PATTERN.test(code)) continue;

    // content chunks for this catalog are produced by chunkText.ts's
    // splitCodeCatalogEntries(), which (deliberately, for retrieval reasons —
    // see that file) slices from the START of the code number, so `content`
    // always begins with the same digits as `code` (e.g. code="Kod 5.24",
    // content="5.24 Piyada keçidi..."). Strip that leading duplicate here —
    // the game already shows `code` separately, showing it twice in an answer
    // option is confusing and was a real reported bug.
    const codeDigits = code.replace(/^Kod\s+/i, '');
    const leadingCodePattern = new RegExp(`^${codeDigits.replace(/\./g, '\\.')}\\s+`);
    description = description.replace(leadingCodePattern, '').trim();

    if (!description) continue;
    if (description.length > MAX_DESCRIPTION_LENGTH) continue;

    const dedupeKey = description.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const storagePath = imageByCode.get(codeDigits);
    const imageUrl = storagePath
      ? supabase.storage.from('sign-images').getPublicUrl(storagePath).data.publicUrl
      : undefined;

    pool.push({ code, description, imageUrl });
  }

  return pool;
}

export async function getSignPool(): Promise<SignPoolEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const data = await fetchSignPool();
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
