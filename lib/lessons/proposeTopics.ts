import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

// Topic-boundary proposal: turn one already-ingested document's chunks into an
// ordered list of PROPOSED topics for an admin to adjust before anything is
// persisted. Nothing here writes to the database and nothing here calls an LLM
// — it is deterministic grouping over existing rows, so an admin can re-run it
// freely and get the same answer.
//
// This file is now TWO things:
//   1. the UNIT builder (buildDocumentUnits) — atomic, never-split runs of
//      consecutive chunks that share an article_label, in document order. This
//      is the candidate segmentation both proposal strategies work from.
//   2. the deterministic PACKER (packUnitsIntoTopics) — size-based grouping of
//      those units into topics.
// lib/lessons/aiProposeTopics.ts reuses (1) and replaces (2) with a batched
// LLM outline pass, falling back to (2) wholesale when the model fails. The
// grouping/title/preview construction lives here so the AI path cannot drift
// from the deterministic one.
//
// WHY GROUP AT ALL: lib/ingestion/chunkText.ts splits aggressively for
// RETRIEVAL (~3200 chars max, often far smaller — a single sign-catalog entry
// can be 30 chars), which is the right granularity for embedding a lookup but
// completely wrong for a lesson. One topic per chunk would produce hundreds of
// two-sentence "topics" per document. The unit we want is a meaningful section:
// roughly one Fəsil/Bölmə, or a run of related Maddə articles.
//
// The grouping signal is `chunks.article_label`, which chunkText.ts already
// populates with the normalized legal marker ("Maddə 45.", "Fəsil III",
// "Bölmə II", and for marker-less documents "Bənd 3.2" / "Kod 1.4.2"). Chunks
// are walked in chunk_index order — which is document order — and consecutive
// chunks sharing a label form an atomic unit that is never split across topics.
// Those units are then packed into topics up to TARGET_TOPIC_CHARS.
//
// Documents with NO structure at all (article_label null throughout, e.g. the
// sign-catalog PDFs) still work: every chunk becomes its own unit and the
// packer groups them by size alone. That degrades to fixed-size topics, which
// is the correct fallback — there is no structure to honour.

export interface ProposedTopicChunk {
  id: string;
  content: string;
  articleLabel: string | null;
  pageNumber: number | null;
}

export interface ProposedTopic {
  /** 0-based position in document order. Becomes lesson_topics.order_index. */
  orderIndex: number;
  /** Best-effort human title, always editable by the admin before saving. */
  title: string;
  /** Distinct article labels covered, in order. May be empty. */
  articleLabels: string[];
  chunkIds: string[];
  /** Total characters of source text — the admin's signal for "too big/small". */
  charCount: number;
  /** First ~200 chars of the first chunk, so the admin can eyeball boundaries. */
  preview: string;
}

export interface TopicProposal {
  documentId: string;
  documentTitle: string;
  topics: ProposedTopic[];
  /**
   * Which strategy actually produced `topics`. 'deterministic' after an AI
   * failure is NOT an error the admin can ignore — the mechanical split is
   * usually coarser — so the UI must surface it.
   */
  source: 'ai' | 'deterministic';
  /** Human-readable, Azerbaijani. Set when the AI pass partly or fully failed. */
  warning?: string;
}

// Sized so one topic is a plausible reading unit AND fits comfortably in a
// single generation call alongside the reading-content + 20-question output.
// A 48-page traffic-law document lands around 15-25 topics at this target,
// which matches the product intent ("more granular is better") without
// producing a hundred stubs.
const TARGET_TOPIC_CHARS = 7000;
// A unit larger than this is a topic on its own rather than being packed with
// a neighbour — it is already at or past the target and adding to it only
// makes the generation call worse.
const MAX_TOPIC_CHARS = 12000;
// Trailing fragments below this get merged BACK into the previous topic rather
// than standing as their own — otherwise a document's closing boilerplate
// ("Qüvvəyə minmə") becomes a topic with nothing to teach.
const MIN_TOPIC_CHARS = 1200;

const PREVIEW_CHARS = 200;

export interface UnitChunk {
  id: string;
  content: string;
  article_label: string | null;
  page_number: number | null;
  chunk_index: number;
}

/** An atomic run of consecutive chunks. Never split across topics. */
export interface TopicUnit {
  label: string | null;
  chunks: UnitChunk[];
  charCount: number;
}

export interface DocumentUnits {
  documentId: string;
  documentTitle: string;
  /** Empty when the document has no chunk rows at all — callers must check. */
  units: TopicUnit[];
}

// A label like "Maddə 45. Yaşayış zonalarında hərəkət" already reads as a
// title. A bare "Fəsil III" does not, so the first line of body text is
// appended when the label carries no descriptive text of its own.
export function deriveTitle(unit: TopicUnit[], fallbackIndex: number): string {
  const labels = unit.map((u) => u.label).filter((l): l is string => Boolean(l));

  if (labels.length > 0) {
    const first = labels[0].replace(/\s+/g, ' ').trim();
    // "Maddə 45. <title>" — a period followed by real text means it's already
    // descriptive; "Fəsil III" / "Maddə 45." alone is not.
    const hasDescription = /\.\s*\S/.test(first);
    if (hasDescription || labels.length === 1) {
      const last = labels[labels.length - 1].replace(/\s+/g, ' ').trim();
      const title = labels.length > 1 && last !== first ? `${first} — ${last}` : first;
      if (hasDescription) return truncateTitle(title);
    }

    const firstLine = firstMeaningfulLine(unit[0]?.chunks[0]?.content ?? '');
    return truncateTitle(firstLine ? `${first} ${firstLine}` : first);
  }

  const firstLine = firstMeaningfulLine(unit[0]?.chunks[0]?.content ?? '');
  return truncateTitle(firstLine || `Mövzu ${fallbackIndex + 1}`);
}

function firstMeaningfulLine(content: string): string {
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (line.length >= 10) return line;
  }
  return content.trim().slice(0, 120);
}

const MAX_TITLE_CHARS = 120;

export function truncateTitle(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  return clean.length > MAX_TITLE_CHARS ? `${clean.slice(0, MAX_TITLE_CHARS - 1)}…` : clean;
}

// Splits a single oversized unit (one enormous Maddə) across several topics at
// chunk boundaries. Chunk boundaries are already sentence-aware from
// chunkText.ts, so this never cuts mid-sentence.
function splitOversizedUnit(unit: TopicUnit): TopicUnit[] {
  if (unit.charCount <= MAX_TOPIC_CHARS || unit.chunks.length <= 1) return [unit];

  const parts: TopicUnit[] = [];
  let current: UnitChunk[] = [];
  let currentChars = 0;

  for (const chunk of unit.chunks) {
    if (current.length > 0 && currentChars + chunk.content.length > TARGET_TOPIC_CHARS) {
      parts.push({ label: unit.label, chunks: current, charCount: currentChars });
      current = [];
      currentChars = 0;
    }
    current.push(chunk);
    currentChars += chunk.content.length;
  }
  if (current.length > 0) {
    parts.push({ label: unit.label, chunks: current, charCount: currentChars });
  }

  return parts;
}

/**
 * Builds the candidate segmentation: document order, atomic units, already
 * size-normalised (oversized units broken at chunk boundaries). Both the
 * deterministic and the AI proposal path start here, so a unit index is a
 * stable reference to real chunk rows in both.
 */
export async function buildDocumentUnits(documentId: string): Promise<DocumentUnits | null> {
  const admin = createAdminClient();

  const { data: document, error: documentError } = await admin
    .from('documents')
    .select('id, title')
    .eq('id', documentId)
    .maybeSingle();

  if (documentError || !document) {
    console.error('[lessons/proposeTopics] document lookup failed:', documentError);
    return null;
  }

  // Deliberately selects `content` for every chunk: char counts, titles and
  // previews all need the text, and a document is at most a few thousand
  // chunks. This runs once per admin click, not on a user request path.
  const { data: chunks, error: chunksError } = await admin
    .from('chunks')
    .select('id, content, article_label, page_number, chunk_index')
    .eq('document_id', documentId)
    .order('chunk_index', { ascending: true })
    .returns<UnitChunk[]>();

  if (chunksError) {
    console.error('[lessons/proposeTopics] chunks read failed:', chunksError);
    return null;
  }

  const documentTitle = document.title as string;

  if (!chunks || chunks.length === 0) {
    return { documentId, documentTitle, units: [] };
  }

  // 1. Consecutive chunks sharing an article_label form one atomic unit.
  //    A null label never merges with anything (two unlabelled runs separated
  //    by a labelled one are genuinely different parts of the document).
  const units: TopicUnit[] = [];
  for (const chunk of chunks) {
    const last = units[units.length - 1];
    if (last && chunk.article_label !== null && last.label === chunk.article_label) {
      last.chunks.push(chunk);
      last.charCount += chunk.content.length;
    } else {
      units.push({
        label: chunk.article_label,
        chunks: [chunk],
        charCount: chunk.content.length,
      });
    }
  }

  // 2. Break any single unit that is already oversized.
  return { documentId, documentTitle, units: units.flatMap(splitOversizedUnit) };
}

/**
 * Materialises one topic from a consecutive run of units. `titleOverride` is
 * how the AI path supplies its own title — the chunk ids, labels, char count
 * and preview are ALWAYS derived from the real unit rows, never from anything
 * a model emitted.
 */
export function topicFromUnits(
  group: TopicUnit[],
  orderIndex: number,
  titleOverride?: string | null
): ProposedTopic {
  const groupChunks = group.flatMap((u) => u.chunks);
  const labels: string[] = [];
  for (const unit of group) {
    if (unit.label && !labels.includes(unit.label)) labels.push(unit.label);
  }

  const firstContent = groupChunks[0]?.content ?? '';
  const cleanOverride = titleOverride?.replace(/\s+/g, ' ').trim();

  return {
    orderIndex,
    title: cleanOverride ? truncateTitle(cleanOverride) : deriveTitle(group, orderIndex),
    articleLabels: labels,
    chunkIds: groupChunks.map((c) => c.id),
    charCount: group.reduce((sum, u) => sum + u.charCount, 0),
    preview:
      firstContent.length > PREVIEW_CHARS
        ? `${firstContent.slice(0, PREVIEW_CHARS).trim()}…`
        : firstContent.trim(),
  };
}

/**
 * Groups units into runs by size only. Returned as index runs (not topics) so
 * the AI path can reuse it per-batch and renumber afterwards. A unit is never
 * split here — buildDocumentUnits already normalised oversized ones — so an
 * article's text always stays whole within one topic.
 */
export function packUnitRuns(units: TopicUnit[]): TopicUnit[][] {
  const grouped: TopicUnit[][] = [];
  let currentGroup: TopicUnit[] = [];
  let currentChars = 0;

  for (const unit of units) {
    if (currentGroup.length > 0 && currentChars + unit.charCount > TARGET_TOPIC_CHARS) {
      grouped.push(currentGroup);
      currentGroup = [];
      currentChars = 0;
    }
    currentGroup.push(unit);
    currentChars += unit.charCount;
  }
  if (currentGroup.length > 0) grouped.push(currentGroup);

  // Fold a runt trailing group back into its predecessor.
  if (grouped.length > 1) {
    const lastGroup = grouped[grouped.length - 1];
    const lastChars = lastGroup.reduce((sum, u) => sum + u.charCount, 0);
    if (lastChars < MIN_TOPIC_CHARS) {
      grouped[grouped.length - 2].push(...lastGroup);
      grouped.pop();
    }
  }

  return grouped;
}

export function packUnitsIntoTopics(units: TopicUnit[]): ProposedTopic[] {
  return packUnitRuns(units).map((group, index) => topicFromUnits(group, index));
}

/**
 * The deterministic proposal. Kept exported and unchanged in behaviour: it is
 * both a standalone strategy and the fallback the AI pass degrades to.
 *
 * Returns `topics: []` for a document with zero chunks. That is honest at this
 * layer but is a FAILURE at the action boundary — see proposeTopicsAction,
 * which converts it into an explicit error rather than letting the admin stare
 * at an empty proposal.
 */
export async function proposeTopicsForDocument(documentId: string): Promise<TopicProposal | null> {
  const doc = await buildDocumentUnits(documentId);
  if (!doc) return null;

  return {
    documentId,
    documentTitle: doc.documentTitle,
    topics: packUnitsIntoTopics(doc.units),
    source: 'deterministic',
  };
}
