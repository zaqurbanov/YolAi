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

function splitWithOverlap(text: string): { piece: string; start: number }[] {
  if (text.length <= MAX_CHARS) return [{ piece: text, start: 0 }];

  const parts: { piece: string; start: number }[] = [];
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
): { piece: string; start: number }[] {
  const rawPieces: { piece: string; start: number }[] = [];
  for (let i = 0; i < markerStarts.length; i++) {
    const segStart = markerStarts[i];
    const segEnd = i + 1 < markerStarts.length ? markerStarts[i + 1] : text.length;
    const raw = text.slice(segStart, segEnd);
    const localTrimStart = raw.length - raw.trimStart().length;
    const piece = raw.trim();
    if (!piece) continue;
    rawPieces.push({ piece, start: segStart + localTrimStart });
  }

  const merged: { piece: string; start: number }[] = [];
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
): { piece: string; start: number }[] | null {
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

function splitEnumeratedList(text: string): { piece: string; start: number }[] | null {
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

  const rawPieces: { piece: string; start: number }[] = [];
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
  const merged: { piece: string; start: number }[] = [];
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
      splitWithOverlap(trimmed);
    for (const { piece, start } of pieces) {
      chunks.push({
        content: piece,
        pageNumber: pageForOffset(segment.offset + trimStart + start),
        articleLabel: segment.label,
        chunkIndex: chunkIndex++,
      });
    }
  }
  return chunks;
}
