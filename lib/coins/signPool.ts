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
  // Reserved for a future per-sign image (docs/sign-speed-game-plan.md's
  // "Future extension" section) — deliberately unpopulated and unused today.
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

  const seen = new Set<string>();
  const pool: SignPoolEntry[] = [];

  for (const row of chunks) {
    const code = typeof row.article_label === 'string' ? row.article_label.trim() : '';
    const description = typeof row.content === 'string' ? row.content.trim() : '';

    if (!code || !description) continue;
    if (!CODE_PATTERN.test(code)) continue;
    if (description.length > MAX_DESCRIPTION_LENGTH) continue;

    const dedupeKey = description.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    pool.push({ code, description });
  }

  return pool;
}

export async function getSignPool(): Promise<SignPoolEntry[]> {
  if (cache && cache.expiresAt > Date.now()) return cache.data;

  const data = await fetchSignPool();
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}
