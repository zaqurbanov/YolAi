import 'server-only';

export interface CitationNumber {
  /** As extracted from the query, e.g. "65", "10-1", "338.2". */
  raw: string;
  /** Base article number only (leading digit group), e.g. "65", "10", "338". */
  base: string;
}

export interface CitationQueryInfo {
  numbers: CitationNumber[];
  /**
   * True only when the query is essentially just the citation itself (e.g.
   * "Maddə 65 nə deyir") — see FILLER_WORDS below. False for queries that
   * combine a citation with substantial free text (e.g. "Maddə 65 və piyada
   * hüquqları haqqında ətraflı danış"), which still needs the trigram lexical
   * pass for "piyada hüquqları". Callers use this to decide whether it's
   * safe to skip match_chunks_per_document's expensive trgm_matches CTE —
   * never to decide whether to run the citation lookup itself, which always
   * runs whenever `numbers` is non-empty (see 0032's citation_matches CTE).
   */
  isCitationOnly: boolean;
}

// "Maddə 65", "maddə 10-1", "Maddə 338.2" — word-prefixed citation form.
// Hyphenated sub-article numbers ("10-1") match chunkText.ts's
// normalizeArticleLabel() output exactly ("Maddə 10-1. <title>"); dotted
// sub-clause numbers ("338.2") never appear in an article_label of their own
// (splitDottedSubclauses keeps the whole enclosing "Maddə N." label for
// every sub-clause piece — see chunkText.ts) except as "Bənd N.M" labels for
// the handful of documents with no Maddə/Fəsil/Bölmə structure at all
// (splitTopLevelDottedClauses). Both separators are captured here and both
// label shapes are tried by 0032's SQL lookup, so it doesn't matter which
// separator the user actually typed.
const MADDE_PATTERN = /madd[əe]\s*(\d+(?:[.-]\d+)?)/gi;

// Bare numeric legal-code shape ("338.2", "127-2") without the "Maddə" word
// — a common shorthand for İnzibati Xətalar Məcəlləsi-style codes.
// Deliberately requires a separator between two digit groups so a plain
// integer (e.g. a speed limit "50") is never treated as a citation — a bare
// integer alone is too ambiguous to safely fast-path.
const BARE_CODE_PATTERN = /(?<![\d.-])(\d{1,4}[.-]\d{1,3})(?![\d.-])/g;

// Generic filler words that commonly accompany a citation-only query
// ("Maddə 65 nə deyir", "127-2 haqqında məlumat ver") and carry no lexical
// search value of their own — stripped before judging whether meaningful
// free text remains alongside the citation.
const FILLER_WORDS = new Set([
  'nə', 'ne', 'deyir', 'haqqında', 'haqqinda', 'barədə', 'barede', 'haqda',
  'nədir', 'nedir', 'necə', 'nece', 'söylə', 'soyle', 'danış', 'danis',
  'izah', 'izahı', 'izahi', 'et', 'edin', 'göstər', 'goster', 'de', 'ver',
  'sən', 'sen', 'zəhmət', 'zehmet', 'olmasa', 'bu', 'olan', 'üçün', 'ucun',
  'məlumat', 'melumat', 'ela', 'elə', 'madda', 'maddə', 'madde',
]);

interface Range {
  start: number;
  end: number;
}

function rangesOverlap(a: Range, b: Range): boolean {
  return a.start < b.end && b.start < a.end;
}

/** Pure regex, no LLM call — safe to run on every request unconditionally,
 * unlike rewriteQuery.ts's LLM round trip. */
export function analyzeCitationQuery(text: string): CitationQueryInfo {
  const numbers: CitationNumber[] = [];
  const seenRaw = new Set<string>();
  const ranges: Range[] = [];

  for (const m of text.matchAll(MADDE_PATTERN)) {
    const idx = m.index ?? 0;
    ranges.push({ start: idx, end: idx + m[0].length });
    const raw = m[1];
    if (!seenRaw.has(raw)) {
      seenRaw.add(raw);
      numbers.push({ raw, base: raw.split(/[.-]/)[0] });
    }
  }

  for (const m of text.matchAll(BARE_CODE_PATTERN)) {
    const idx = m.index ?? 0;
    const range = { start: idx, end: idx + m[0].length };
    // Skip if already covered by a "Maddə N" match above (e.g. the "338.2"
    // inside "Maddə 338.2" would otherwise be extracted twice).
    if (ranges.some((r) => rangesOverlap(r, range))) continue;
    ranges.push(range);
    const raw = m[1];
    if (!seenRaw.has(raw)) {
      seenRaw.add(raw);
      numbers.push({ raw, base: raw.split(/[.-]/)[0] });
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  let leftover = '';
  let cursor = 0;
  for (const r of ranges) {
    leftover += text.slice(cursor, r.start) + ' ';
    cursor = r.end;
  }
  leftover += text.slice(cursor);

  const leftoverWords = leftover
    .toLowerCase()
    .split(/[^a-zəıöüçşğ0-9]+/i)
    .filter((w) => w.length >= 3 && !FILLER_WORDS.has(w));

  return {
    numbers,
    isCitationOnly: numbers.length > 0 && leftoverWords.length === 0,
  };
}
