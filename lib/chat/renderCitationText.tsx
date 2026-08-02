import type { ReactNode } from 'react';

// Matches inline bracket citations the LLM embeds in raw message text per the
// instruction in lib/rag/buildPrompt.ts, e.g.
// "[Sənəd: Yol hərəkəti qaydaları, Maddə 37, səhifə 2]" — page/"səhifə" part is
// optional, and the reference after the title is not only an article ("Maddə N")
// but any legal-unit label the model legitimately emits, chiefly "Bənd N" (a
// clause of an article, e.g. "Bənd 6.4") — before this was matched, a "Bənd"
// citation rendered as plain text while a "Maddə" one in the same answer was
// colored, which read as a bug. Keep this label set in sync with what
// buildPrompt.ts instructs. Numbers may be dotted/hyphenated ("Maddə 18.65.5.1",
// "Maddə 37-1"). Case-insensitive so "sənəd:"/"maddə" still match.
// Non-greedy up to the first "]" so an unclosed bracket mid-stream (partial
// text while the model is still streaming) simply doesn't match and renders
// as plain text until the closing bracket arrives.
const CITATION_RE =
  /\[(Sənəd:\s*)([^,\]]+)(,\s*)((?:Maddə|Bənd|Fəsil|Bölmə|Hissə|Qayda)\s+[^,\]]+?)((?:,[^\]]*)?)\]/gi;

// Matches verbatim excerpts the LLM wraps in Azerbaijani guillemets per the
// instruction in lib/rag/buildPrompt.ts — "«...»" marks text copied
// word-for-word from the retrieved KONTEKST, never the model's own
// paraphrase. Excludes "»" from the captured span so an unclosed "«" mid-
// stream simply doesn't match and renders as plain text until "»" arrives.
const EXCERPT_RE = /«([^»]*)»/g;

/**
 * Splits raw assistant message text on inline "[Sənəd: ..., Maddə N, səhifə P]"
 * citations and "«...»" verbatim excerpts, returning text/span nodes:
 * - citation brackets render fully bold on a soft danger-tinted chip, with the
 *   document title in danger/red and the "Maddə N" article reference in
 *   success/green (everything else in the bracket — literal brackets,
 *   "Sənəd:", commas, "səhifə N" — stays default color but inherits the bold
 *   from the wrapper). The tinted background is what makes the reference pop
 *   against body text on any theme, where a bare colored word can read washed
 *   out — this is deliberately a chip, not just colored text.
 * - "«...»" excerpts (guillemets included) render italic accent on a soft
 *   accent-tinted chip, distinct from both citation colors and body text
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
      <span
        key={`citation-${key++}`}
        className="rounded-md bg-[var(--danger)]/10 px-1 py-px font-bold"
      >
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
      <span
        key={`excerpt-${nextKey()}`}
        className="rounded-md bg-[var(--accent)]/10 px-1 py-px italic text-[var(--accent)]"
      >
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
