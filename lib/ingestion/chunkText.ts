export interface PageText {
  pageNumber: number;
  text: string;
}

export interface Chunk {
  content: string;
  pageNumber: number | null;
  articleLabel: string | null;
  chunkIndex: number;
}

// `label` is only ever populated by splitTopLevelDottedClauses (per-piece
// clause label, since that strategy's pieces can each belong to a different
// section — e.g. "3.2" vs "4.1" — unlike every other strategy here, whose
// pieces all share the enclosing segment's single label). Left undefined by
// every other strategy so chunkPages falls back to the segment label.
interface TextPiece {
  piece: string;
  start: number;
  label?: string;
}

// "Maddə\s+\d+" alone also matches mid-sentence amendment-log references like
// "...Qanunvericilik Toplusu, № 9, maddə 150) ilə 27-ci maddəsinin..." (citing an
// article number of a legislative bulletin, not a structural header of this law).
// Genuine headers are always "Maddə <N>[-<M>]." — require the literal period
// immediately after the number to exclude the ")" / free-text amendment-log form.
// Some pages render header prefixes with a space inserted between every
// character (e.g. "M a d d ə 4 5 . Yaşayış zonalarında hərəkət") while the
// title text itself stays normally spaced — allow optional whitespace between
// the letters of "Maddə" and between digits so those headers are still found.
const ARTICLE_MARKER =
  /(M\s*a\s*d\s*d\s*ə\s+\d(?:\s*\d)*(?:\s*-\s*\d(?:\s*\d)*)?\s*\.[^\n]*|Fəsil\s+[IVXLCDM\d]+[^\n]*|Bölmə\s+[IVXLCDM\d]+[^\n]*)/gi;

function normalizeArticleLabel(label: string): string {
  return label.replace(
    /^M\s*a\s*d\s*d\s*ə\s+(\d(?:\s*\d)*)(?:\s*-\s*(\d(?:\s*\d)*))?\s*\./i,
    (_match, num: string, sub: string | undefined) => {
      const n = num.replace(/\s+/g, '');
      const s = sub ? `-${sub.replace(/\s+/g, '')}` : '';
      return `Maddə ${n}${s}.`;
    }
  );
}

// ~700-900 tokens, approximated as ~4 chars/token for AZ Latin text
const MAX_CHARS = 3200;
const OVERLAP_CHARS = 500;

function splitWithOverlap(text: string): TextPiece[] {
  if (text.length <= MAX_CHARS) return [{ piece: text, start: 0 }];

  const parts: TextPiece[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + MAX_CHARS, text.length);
    if (end < text.length) {
      const lastBreak = text.lastIndexOf('.', end);
      if (lastBreak > start + MAX_CHARS / 2) end = lastBreak + 1;
    }
    const piece = text.slice(start, end).trim();
    if (piece) parts.push({ piece, start });
    if (end >= text.length) break;
    start = end - OVERLAP_CHARS;
  }
  return parts;
}

// "Maddə 1. Əsas anlayışlar" is not prose — it's dozens of enumerated term
// definitions, each starting a new line with "<N>[-<M>])" (e.g. "15-3)",
// "16)"), then the term, then a dash, then the definition. Naive fixed-size
// splitting from splitWithOverlap dilutes short-lookup relevance by bundling
// many unrelated definitions into one embedding. Only run this inside a
// segment already delimited by ARTICLE_MARKER (chunkPages does this), so a
// false match here can never swallow a real article boundary.
//
// The same digit-paren shape also appears in amendment-log citations like
// "...Qanunvericilik Toplusu, № 9, maddə 150) ilə 27-ci maddəsinin..." — guard
// against that the same way ARTICLE_MARKER guards against it: (1) require the
// marker at the start of a line (real definitions are always line-initial;
// the amendment citation is embedded mid-sentence and only coincidentally
// lands at a line start after PDF text wrapping), (2) reject if immediately
// followed by "ilə" (the amendment phrasing "maddə 150) ilə ..."), and
// (3) require a dash ("–" or " - ") within a short lookahead window after the
// marker, present in real definitions ("term – definition...") but absent
// from the citation text.
const SUBCLAUSE_MARKER = /^[ \t]*(\d+(?:-\d+)?\))(?!\s*ilə)/gm;
const SUBCLAUSE_LOOKAHEAD_CHARS = 100;
const MIN_SUBCLAUSES = 3;
const SHORT_SUBCLAUSE_CHARS = 150;

// A single "Maddə N." body is often not prose but a run of numbered sub-clauses
// like "N.1.", "N.2.", "N.1-1." — each a distinct offence/rule with its own
// fine amount (e.g. Maddə 339 bundles 339.1 through 339.9+ into one segment
// per ARTICLE_MARKER, since "339.3." is sub-item body text, not its own
// article header). Left unsplit, a query about one specific sub-clause (e.g.
// "339.3-ün cəriməsi") gets diluted across an embedding of the whole article
// and can fail to retrieve at all. unpdf's page-by-page extraction does not
// reliably preserve line breaks at these boundaries (unlike the bracketed
// "N)" definitions list in Maddə 1, which is genuinely line-initial), so this
// marker is matched anywhere in the text rather than only at line start.
// The false-positive risk is cross-references to *other* articles' sub-items,
// e.g. "Məcəllənin 150.4-cü maddəsinin" or "124.4 - 124.6, 125.4"  — both
// forms are structurally distinguishable from a real header: (1) a reference
// always uses a different base article number than the enclosing Maddə, so
// requiring the marker's leading number to equal the current Maddə's own
// number rejects them outright, and (2) even a same-number self-reference
// uses the ordinal suffix ("339.3-cü bəndə") with no period after the number,
// whereas a real header is always "339.3." — the required trailing literal
// period excludes the ordinal form structurally.
const SHORT_DOTTED_SUBCLAUSE_CHARS = 150;

function buildPiecesFromMarkers(
  text: string,
  markerStarts: number[]
): TextPiece[] {
  const rawPieces: TextPiece[] = [];
  for (let i = 0; i < markerStarts.length; i++) {
    const segStart = markerStarts[i];
    const segEnd = i + 1 < markerStarts.length ? markerStarts[i + 1] : text.length;
    const raw = text.slice(segStart, segEnd);
    const localTrimStart = raw.length - raw.trimStart().length;
    const piece = raw.trim();
    if (!piece) continue;
    rawPieces.push({ piece, start: segStart + localTrimStart });
  }

  const merged: TextPiece[] = [];
  let bufferPiece = '';
  let bufferStart = -1;
  const flush = () => {
    if (bufferPiece) merged.push({ piece: bufferPiece, start: bufferStart });
    bufferPiece = '';
    bufferStart = -1;
  };

  for (const { piece, start } of rawPieces) {
    if (piece.length > MAX_CHARS) {
      flush();
      for (const sub of splitWithOverlap(piece)) {
        merged.push({ piece: sub.piece, start: start + sub.start });
      }
      continue;
    }
    if (piece.length < SHORT_DOTTED_SUBCLAUSE_CHARS) {
      if (bufferPiece && bufferPiece.length + 1 + piece.length <= MAX_CHARS) {
        bufferPiece = `${bufferPiece}\n${piece}`;
      } else {
        flush();
        bufferPiece = piece;
        bufferStart = start;
      }
    } else {
      flush();
      merged.push({ piece, start });
    }
  }
  flush();

  return merged;
}

function articleBaseNumber(label: string | null): string | null {
  if (!label) return null;
  const m = /^Maddə\s+(\d+)/i.exec(label);
  return m ? m[1] : null;
}

const MIN_DOTTED_SUBCLAUSES = 2;

function splitDottedSubclauses(
  text: string,
  articleNumber: string
): TextPiece[] | null {
  // Also reject if immediately followed by another digit: real sub-clause
  // headers are always followed by clause text starting with a letter, but a
  // three-part dotted date ("15.06.2023") would otherwise false-match the
  // first two segments as a header for Maddə 15 ("15.06." + a leading "2").
  const marker = new RegExp(`(?<!\\d)${articleNumber}\\.\\d+(?:-\\d+)?\\.(?!\\s*\\d)`, 'g');
  const markerStarts: number[] = [];
  for (const m of text.matchAll(marker)) {
    markerStarts.push(m.index ?? 0);
  }
  if (markerStarts.length < MIN_DOTTED_SUBCLAUSES) return null;

  // The article header itself ("Maddə 339. <title> 339.1. ...") precedes the
  // first real marker; keep that preamble attached to the first sub-clause
  // rather than dropping it, so the header/title stays retrievable too.
  if (markerStarts[0] > 0) markerStarts[0] = 0;

  return buildPiecesFromMarkers(text, markerStarts);
}

const MIN_PLAIN_SUBCLAUSES = 3;

// Some long "Maddə N." bodies (e.g. Maddə 37, driver duties) enumerate
// distinct, freestanding sub-duties/prohibitions as line-initial "N)"
// markers with NO following dash — unlike Maddə 1's "term – definition" list
// (splitEnumeratedList, dash-gated), these read like "1) sürücülük
// vəsiqəsini ... saxlamalıdır; 2) ... nəqliyyat vasitəsini dayandırdıqda
// ...". They also commonly sit under Roman-numeral subsection headers
// ("I.", "II." ...) that themselves aren't marker-based, so those headers
// stay merged into whichever adjacent numbered piece precedes the next
// marker. Left as one segment-wide chunk, a query about a single duty (e.g.
// "hansı sənədləri saxlamalıdır") gets diluted across a dozen-plus unrelated
// duties sharing generic vocabulary ("sənəd", "vəsiqə", "şəhadətnamə") and
// can be outscored by a more specific competing chunk from another document.
// splitEnumeratedList (dash-gated) and splitDottedSubclauses (this article's
// own "N.M." numbering) are both tried first — a genuine definition list or
// dotted-subclause article is never routed here since this only fires when
// those stricter, more specific patterns find nothing. Same false-positive
// guards as SUBCLAUSE_MARKER: line-initial only (a genuine duty is always
// its own list line; the risk case — referencing a bənd by number
// mid-sentence, e.g. "bu maddənin 1-ci bəndi" — is never line-initial) and
// the "ilə" exclusion for amendment-log citations ("maddə 150) ilə").
// Some documents ("Əsasnamə"-style regulations, e.g. the technical-inspection
// rules document) have ZERO Maddə/Fəsil/Bölmə headers anywhere — their only
// structure is dotted clause numbering ("3.2.", "4.1.") directly at the top
// level, with no enclosing "Maddə N." to derive a base number from (unlike
// splitDottedSubclauses above, which is always invoked from inside an
// already-identified Maddə segment and locks to that Maddə's own number to
// reject cross-references to other articles). Confirmed live: this document's
// chunks all end up with article_label = null and, lacking any Maddə header,
// fall straight through to the generic size-window splitWithOverlap fallback
// as one giant undifferentiated segment — diluting a specific, directly
// relevant clause (3.2, listing documents required for a technical
// inspection) into a chunk dominated by unrelated surrounding text, letting
// an unrelated chunk from a better-structured document outrank it in
// retrieval.
//
// Unlike splitDottedSubclauses, no single base-number lock is needed or
// possible here: a document with this top-level numbering genuinely has
// multiple sections (3.x, 4.x, 5.x, ...), each its own base number, and all
// of them are real structure, not cross-references — so every "N.M." marker
// found is treated as a genuine clause boundary regardless of N. The same
// date-like guard as splitDottedSubclauses is carried over unchanged (reject
// a marker immediately followed by another digit, so "15.06.2023" doesn't
// false-match as clause "15.6").
//
// Scope is deliberately narrow: this is only invoked by chunkPages for the
// matches.length === 0 case, i.e. a whole document with NO Maddə/Fəsil/Bölmə
// marker anywhere — never for a label:null segment that merely precedes a
// document's first Maddə header (e.g. a preamble in an otherwise normally
// structured document). Those documents already have real structure
// elsewhere via the existing per-Maddə-segment strategies; this dotted-clause
// strategy has only been verified against fully Maddə-less documents, and a
// preamble block falling through to the existing, known-safe generic
// fallback is preferable to an untested broader scope. A higher minimum
// marker count than splitDottedSubclauses' MIN_DOTTED_SUBCLAUSES is used
// because this runs unscoped across an entire document rather than within
// one already-confirmed Maddə — a document that just happens to contain a
// couple of stray "N.M." dates or measurements (and nothing else structural)
// should fall through to the generic fallback instead of over-triggering.
const TOP_LEVEL_DOTTED_MARKER = /(?<!\d)(\d+\.\d+(?:-\d+)?)\.(?!\s*\d)/g;
const MIN_TOP_LEVEL_DOTTED_CLAUSES = 5;

function splitTopLevelDottedClauses(text: string): TextPiece[] | null {
  const markers: { start: number; label: string }[] = [];
  for (const m of text.matchAll(TOP_LEVEL_DOTTED_MARKER)) {
    markers.push({ start: m.index ?? 0, label: m[1] });
  }
  if (markers.length < MIN_TOP_LEVEL_DOTTED_CLAUSES) return null;

  const markerStarts = markers.map((m) => m.start);
  const labelsByStart = new Map<number, string>();
  for (const m of markers) labelsByStart.set(m.start, m.label);

  // Keep the segment preamble (document title/intro text before the first
  // real clause marker) attached to the first clause rather than dropping it
  // — same rationale as splitDottedSubclauses/splitPlainEnumeratedList — but
  // the first clause's own label still applies to that merged piece.
  if (markerStarts[0] > 0) {
    labelsByStart.set(0, markers[0].label);
    markerStarts[0] = 0;
  }

  const pieces = buildPiecesFromMarkers(text, markerStarts);

  // buildPiecesFromMarkers may merge several short raw pieces into one output
  // piece, but a merged piece's start is always exactly one of the marker
  // starts above (merging only appends subsequent text, never shifts where a
  // piece begins) — so looking up by start reliably recovers which clause
  // each output piece begins at.
  return pieces.map((p) => ({ ...p, label: labelsByStart.get(p.start) && `Bənd ${labelsByStart.get(p.start)}` }));
}

// Sign/code catalog documents (e.g. a "Yol nişanları" reference PDF: a table
// of Kod | Təsvir | Lövhə rows — code, text description, and a sign image
// that never extracts as text) have NO Maddə/Fəsil/Bölmə headers and no
// trailing-period dotted clauses ("3.2." — TOP_LEVEL_DOTTED_MARKER above), so
// they'd otherwise fall all the way through to splitWithOverlap's 3200-char
// window — confirmed live against a real 26-page, 198-entry catalog PDF: the
// whole cleaned document was only ~17.6K chars, meaning ~5-6 giant chunks for
// 198 distinct signs, each chunk burying dozens of unrelated entries together
// and diluting retrieval for any single sign. Each row is short and already a
// complete, self-contained unit ("1.1 Şlaqbaumlu dəmir yol keçidi") — the
// natural fix is one chunk per entry, not size-window bucketing.
//
// Deliberately NOT line-anchored (unlike SUBCLAUSE_MARKER's line-initial
// requirement): confirmed live that unpdf's page-boundary text sometimes
// glues a leftover boilerplate fragment onto the first real line of a page
// (e.g. "NİSANLARİĞ1.4.2 Dəmir yol keçidinə yaxınlaşma" — "NİSANLARİĞ" is a
// stray remnant of a repeated header line stripBoilerplate couldn't fully
// normalize away since its trailing content differs per page). A line-anchored
// marker would silently miss every such entry (~1 per page). Matching
// anywhere in the text — the same "page-boundary corruption" rationale
// SUBCLAUSE_MARKER/splitDottedSubclauses already use elsewhere in this file —
// sidesteps this. False-positive risk (matching a stray number mid-sentence)
// is guarded by requiring the code to be followed by whitespace then an
// uppercase Azerbaijani letter (real descriptions are always capitalized;
// this also incidentally excludes date-like sequences such as "15.06.2023",
// which are never followed by a capital letter).
const CODE_CATALOG_MARKER = /(?<!\d)(\d+(?:\.\d+){1,3})\s+(?=[A-ZÇƏĞİÖŞÜ])/g;
const MIN_CODE_CATALOG_ENTRIES = 5;

function splitCodeCatalogEntries(text: string): TextPiece[] | null {
  const markers: { start: number; label: string }[] = [];
  for (const m of text.matchAll(CODE_CATALOG_MARKER)) {
    markers.push({ start: m.index ?? 0, label: m[1] });
  }
  if (markers.length < MIN_CODE_CATALOG_ENTRIES) return null;

  const labelsByStart = new Map<number, string>();
  for (const m of markers) labelsByStart.set(m.start, m.label);

  const markerStarts = markers.map((m) => m.start);
  // Keep any preamble (e.g. a leading category heading like "XƏBƏRDARLIQ
  // NİŞANLARI") attached to the first real entry rather than dropping it —
  // same rationale as every other strategy's preamble handling in this file.
  if (markerStarts[0] > 0) {
    labelsByStart.set(0, markers[0].label);
    markerStarts[0] = 0;
  }

  // Intentionally NOT using buildPiecesFromMarkers here — its short-piece
  // merging exists to stop tiny fragments from diluting retrieval, but here
  // each entry (~20-60 chars) is already the complete unit; merging several
  // back together would just reproduce the oversized-chunk problem this
  // strategy exists to fix. One chunk per matched entry; an (unexpectedly)
  // oversized piece still falls back to the overlap splitter defensively.
  const pieces: TextPiece[] = [];
  for (let i = 0; i < markerStarts.length; i++) {
    const segStart = markerStarts[i];
    const segEnd = i + 1 < markerStarts.length ? markerStarts[i + 1] : text.length;
    const raw = text.slice(segStart, segEnd);
    const localTrimStart = raw.length - raw.trimStart().length;
    const piece = raw.trim();
    if (!piece) continue;
    const start = segStart + localTrimStart;
    if (piece.length > MAX_CHARS) {
      for (const sub of splitWithOverlap(piece)) {
        pieces.push({ piece: sub.piece, start: start + sub.start });
      }
    } else {
      pieces.push({ piece, start, label: labelsByStart.get(segStart) && `Kod ${labelsByStart.get(segStart)}` });
    }
  }
  return pieces;
}

function splitPlainEnumeratedList(text: string): TextPiece[] | null {
  const markerStarts: number[] = [];
  for (const m of text.matchAll(SUBCLAUSE_MARKER)) {
    markerStarts.push(m.index ?? 0);
  }
  if (markerStarts.length < MIN_PLAIN_SUBCLAUSES) return null;

  // Keep the segment header/preamble (article title, any Roman-numeral
  // subsection intro like "I. Mexaniki nəqliyyat vasitəsinin sürücüsü:")
  // attached to the first sub-item rather than dropping it — same rationale
  // as splitDottedSubclauses.
  if (markerStarts[0] > 0) markerStarts[0] = 0;

  return buildPiecesFromMarkers(text, markerStarts);
}

function splitEnumeratedList(text: string): TextPiece[] | null {
  const markerStarts: number[] = [];
  for (const m of text.matchAll(SUBCLAUSE_MARKER)) {
    const markerStart = m.index ?? 0;
    const markerEnd = markerStart + m[0].length;
    const lookahead = text.slice(markerEnd, markerEnd + SUBCLAUSE_LOOKAHEAD_CHARS);
    if (/–|\s-\s/.test(lookahead)) {
      markerStarts.push(markerStart);
    }
  }
  if (markerStarts.length < MIN_SUBCLAUSES) return null;

  const rawPieces: TextPiece[] = [];
  for (let i = 0; i < markerStarts.length; i++) {
    const segStart = markerStarts[i];
    const segEnd = i + 1 < markerStarts.length ? markerStarts[i + 1] : text.length;
    const raw = text.slice(segStart, segEnd);
    const localTrimStart = raw.length - raw.trimStart().length;
    const piece = raw.trim();
    if (!piece) continue;
    rawPieces.push({ piece, start: segStart + localTrimStart });
  }

  // Merge consecutive short definitions (up to MAX_CHARS) so tiny embeddings
  // don't fragment retrieval; split any single definition that's itself
  // oversized via the existing overlap splitter. Never merge across a
  // sub-clause boundary in a way that drops the boundary — the merged chunk
  // still starts at a real marker and only appends whole subsequent pieces.
  const merged: TextPiece[] = [];
  let bufferPiece = '';
  let bufferStart = -1;
  const flush = () => {
    if (bufferPiece) merged.push({ piece: bufferPiece, start: bufferStart });
    bufferPiece = '';
    bufferStart = -1;
  };

  for (const { piece, start } of rawPieces) {
    if (piece.length > MAX_CHARS) {
      flush();
      for (const sub of splitWithOverlap(piece)) {
        merged.push({ piece: sub.piece, start: start + sub.start });
      }
      continue;
    }
    if (piece.length < SHORT_SUBCLAUSE_CHARS) {
      if (bufferPiece && bufferPiece.length + 1 + piece.length <= MAX_CHARS) {
        bufferPiece = `${bufferPiece}\n${piece}`;
      } else {
        flush();
        bufferPiece = piece;
        bufferStart = start;
      }
    } else {
      flush();
      merged.push({ piece, start });
    }
  }
  flush();

  return merged;
}

export function chunkPages(pages: PageText[]): Chunk[] {
  const fullText = pages.map((p) => p.text).join('\n');

  // Map character offsets back to page numbers
  const offsets: { start: number; pageNumber: number }[] = [];
  let running = 0;
  for (const p of pages) {
    offsets.push({ start: running, pageNumber: p.pageNumber });
    running += p.text.length + 1;
  }
  const pageForOffset = (offset: number) => {
    let result = offsets[0]?.pageNumber ?? 1;
    for (const o of offsets) {
      if (o.start <= offset) result = o.pageNumber;
      else break;
    }
    return result;
  };

  const segments: { label: string | null; text: string; offset: number }[] = [];
  const matches = [...fullText.matchAll(ARTICLE_MARKER)];
  // Only a document with zero Maddə/Fəsil/Bölmə markers anywhere is eligible
  // for splitTopLevelDottedClauses — see that function's comment for why this
  // is scoped narrower than "any label:null segment".
  const documentHasNoStructuralMarkers = matches.length === 0;

  if (matches.length === 0) {
    segments.push({ label: null, text: fullText, offset: 0 });
  } else {
    let prevIndex = 0;
    let prevLabel: string | null = null;
    for (const match of matches) {
      const idx = match.index ?? 0;
      if (idx > prevIndex) {
        segments.push({ label: prevLabel, text: fullText.slice(prevIndex, idx), offset: prevIndex });
      }
      prevLabel = normalizeArticleLabel(match[0].trim());
      prevIndex = idx;
    }
    segments.push({ label: prevLabel, text: fullText.slice(prevIndex), offset: prevIndex });
  }

  const chunks: Chunk[] = [];
  let chunkIndex = 0;
  for (const segment of segments) {
    const trimStart = segment.text.length - segment.text.trimStart().length;
    const trimmed = segment.text.trim();
    if (!trimmed) continue;
    // A segment can span multiple pages (most notably the pre-first-header
    // preamble/definitions block); attribute each piece to the page it
    // actually starts on rather than the whole segment's start page.
    const articleNumber = articleBaseNumber(segment.label);
    const pieces =
      splitEnumeratedList(trimmed) ??
      (articleNumber ? splitDottedSubclauses(trimmed, articleNumber) : null) ??
      splitPlainEnumeratedList(trimmed) ??
      (segment.label === null && documentHasNoStructuralMarkers
        ? (splitCodeCatalogEntries(trimmed) ?? splitTopLevelDottedClauses(trimmed))
        : null) ??
      splitWithOverlap(trimmed);
    for (const piece of pieces) {
      chunks.push({
        content: piece.piece,
        pageNumber: pageForOffset(segment.offset + trimStart + piece.start),
        articleLabel: piece.label ?? segment.label,
        chunkIndex: chunkIndex++,
      });
    }
  }
  return chunks;
}
