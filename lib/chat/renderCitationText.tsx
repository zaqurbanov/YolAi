import type { ReactNode } from 'react';

// Matches inline bracket citations the LLM embeds in raw message text per the
// instruction in lib/rag/buildPrompt.ts, e.g.
// "[Sənəd: Yol hərəkəti qaydaları, Maddə 37, səhifə 2]" — page/"səhifə" part is
// optional, article label may be alphanumeric/hyphenated ("Maddə 37-1").
// Non-greedy up to the first "]" so an unclosed bracket mid-stream (partial
// text while the model is still streaming) simply doesn't match and renders
// as plain text until the closing bracket arrives.
const CITATION_RE = /\[(Sənəd:\s*)([^,\]]+)(,\s*)(Maddə\s+[^,\]]+?)((?:,[^\]]*)?)\]/g;

// Matches verbatim excerpts the LLM wraps in Azerbaijani guillemets per the
// instruction in lib/rag/buildPrompt.ts — "«...»" marks text copied
// word-for-word from the retrieved KONTEKST, never the model's own
// paraphrase. Excludes "»" from the captured span so an unclosed "«" mid-
// stream simply doesn't match and renders as plain text until "»" arrives.
const EXCERPT_RE = /«([^»]*)»/g;

/**
 * Splits raw assistant message text on inline "[Sənəd: ..., Maddə N, səhifə P]"
 * citations and "«...»" verbatim excerpts, returning text/span nodes:
 * - citation brackets render fully bold, with the document title in
 *   danger/red and the "Maddə N" article reference in success/green
 *   (everything else in the bracket — literal brackets, "Sənəd:", commas,
 *   "səhifə N" — stays default color but inherits the bold from the wrapper)
 * - "«...»" excerpts (guillemets included) render in italic accent color,
 *   distinct from both citation colors and body text
 * Citations are matched first over the whole string; the excerpt pass then
 * runs only over the plain-text segments left between/around citations, so
 * a single answer containing both interleaved renders correctly.
 */
export function renderCitationText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    const [full, prefix, title, sep, article, rest] = match;

    if (match.index > lastIndex) {
      nodes.push(...renderExcerpts(text.slice(lastIndex, match.index), () => key++));
    }

    nodes.push(
      <span key={`citation-${key++}`} className="font-bold">
        {'['}
        {prefix}
        <span className="text-[var(--danger)]">{title}</span>
        {sep}
        <span className="text-success">{article}</span>
        {rest}
        {']'}
      </span>,
    );

    lastIndex = match.index + full.length;
  }

  if (lastIndex < text.length) {
    nodes.push(...renderExcerpts(text.slice(lastIndex), () => key++));
  }

  return nodes;
}

/** Splits a plain-text (non-citation) segment on "«...»" verbatim excerpts. */
function renderExcerpts(segment: string, nextKey: () => number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  EXCERPT_RE.lastIndex = 0;
  while ((match = EXCERPT_RE.exec(segment)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(segment.slice(lastIndex, match.index));
    }

    nodes.push(
      <span key={`excerpt-${nextKey()}`} className="italic text-[var(--accent)]">
        {match[0]}
      </span>,
    );

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < segment.length) {
    nodes.push(segment.slice(lastIndex));
  }

  return nodes;
}
