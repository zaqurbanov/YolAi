// Detects "Maddə N[-M]" (article number) references in a raw user query, to
// drive the article-number fast path added in migration 0032 (see that
// migration's header comment for the full performance rationale). Operates
// only on the RAW user query, never the rewritten one -- rewriteQuery.ts can
// hallucinate/drift (see its own and search.ts's comments on this), and an
// invented article number here would silently retrieve the wrong article,
// which is exactly the kind of grounding failure this app must not permit.

export interface ArticleReference {
  base: string;
  sub: string | null;
}

// Mirrors chunkText.ts's ARTICLE_MARKER header shape ("Maddə <N>[-<M>].") but
// looser on purpose -- this matches a user's casual phrasing ("madde 65",
// "Maddə 65-ci", "maddə 65:") not just the exact normalized header form.
const ARTICLE_REF_PATTERN = /madd[əe]\s*(\d+)(?:\s*-\s*(\d+))?/gi;

/** All distinct "Maddə N[-M]" references in the query, in first-seen order, deduped. */
export function extractArticleReferences(query: string): ArticleReference[] {
  const refs: ArticleReference[] = [];
  const seen = new Set<string>();
  const pattern = new RegExp(ARTICLE_REF_PATTERN);
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(query)) !== null) {
    const base = match[1];
    const sub = match[2] ?? null;
    const key = `${base}-${sub ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      refs.push({ base, sub });
    }
  }
  return refs;
}

/**
 * SQL LIKE prefixes matching chunkText.ts's normalizeArticleLabel output
 * exactly ("Maddə <N>." or "Maddə <N>-<M>."), anchored so "Maddə 65" never
 * matches "Maddə 650." -- see match_chunks_by_article (0032) for why a
 * prefix match (not exact equality) is required: article_label stores the
 * full header line including trailing title text.
 */
export function articleLabelPrefixes(refs: ArticleReference[]): string[] {
  return refs.map((r) => `Maddə ${r.base}${r.sub ? `-${r.sub}` : ''}.%`);
}

// After stripping every matched "Maddə N[-M]" mention, how many leftover
// words tolerate still treating the query as "essentially just the article
// reference" (safe to skip the expensive trigram scan for -- see route.ts).
// 2 covers short filler like "Maddə 65 nə deyir" ("nə deyir" = 2 words) while
// still running trigram for genuine additional free text ("Maddə 65 və
// piyada hüquqları haqqında ətraflı danış" strips to 6 remaining words).
const PURE_REFERENCE_MAX_LEFTOVER_WORDS = 2;

/**
 * True when the query is essentially just one or more article references
 * with no substantial additional free text -- in that case the article fast
 * path already covers what trigram search was compensating for, so trigram
 * can be skipped for this request without losing recall. False whenever
 * there's no article reference at all (nothing to fast-path) or there's
 * enough surrounding text that trigram still adds value.
 */
export function isPureArticleReferenceQuery(query: string, refs: ArticleReference[]): boolean {
  if (refs.length === 0) return false;
  const stripped = query.replace(new RegExp(ARTICLE_REF_PATTERN), ' ');
  const leftoverWords = stripped.trim().split(/\s+/).filter(Boolean);
  return leftoverWords.length <= PURE_REFERENCE_MAX_LEFTOVER_WORDS;
}
