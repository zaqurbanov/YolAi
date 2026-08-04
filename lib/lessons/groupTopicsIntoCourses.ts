import 'server-only';
import { z } from 'zod';
import { getRewriteModelChain, getRewriteModelId, getProviderCallOptions } from '@/lib/llm';
import { generateObjectWithRouting } from '@/lib/llm/fallback';
import { truncateTitle, type ProposedTopic, type TopicProposal } from '@/lib/lessons/proposeTopics';
import { logError } from '@/lib/logging/logError';

// A SECOND grouping pass, one level up from lib/lessons/aiProposeTopics.ts.
//
// THE PROBLEM. aiProposeTopicsForDocument() turns one document into ~50 ordered
// topics, and the old flow wrote all 50 into a SINGLE lesson_courses row. On
// /oyrenme that renders as one enormous course with one price — a learner
// cannot buy "just the road signs part", and the admin cannot price sections
// differently. The product wants 6-8 separate courses per document ("Yol
// nişanları — 10 dərs · 15 enerji", "Kəsişmələrdən keçmə — 8 dərs · 20 enerji"),
// each its own lesson_courses row over the SAME document_id (which 0060
// explicitly allows — document_id is deliberately not unique).
//
// WHY A SEPARATE PASS AND NOT A BIGGER PROMPT IN aiProposeTopics. That file
// batches 40 units at a time and never sees the whole document at once, so it
// structurally cannot decide document-level sections. This pass runs AFTER it,
// over the finished topic list, and the input is small enough (~50 lines of
// title + size) that ONE structured call sees all of it. Two passes also keep
// the single-course flow (proposeTopicsAction) working unchanged.
//
// THE MODEL NEVER EMITS CHUNK IDS OR TOPIC CONTENT — same invariant as
// messages.citations and as aiProposeTopics. It returns index RANGES into the
// topic array plus an Azerbaijani title; the ProposedTopic objects (and with
// them every chunk id) are resolved from the real array by index. A title is
// the only free text that survives, and the admin edits it before anything is
// written.
//
// GROUPS ARE CONSECUTIVE RANGES, always. Topic order is document order, and a
// course whose topics jump around the source document is neither teachable nor
// reviewable. Ranges are validated in-range / non-overlapping / contiguous /
// total-coverage and REPAIRED to full coverage (repairRanges below is the same
// shape as repairGroups() in aiProposeTopics.ts, adapted to carry a
// description). A response that cannot be repaired falls back to an even
// deterministic split — never to dropping topics, since a dropped topic is a
// section of the document that silently never becomes a lesson.

/** Aim: one group is a course a learner can finish in a sitting or two. */
const TARGET_TOPICS_PER_GROUP = 7;
const MAX_GROUPS = 8;
// Below this a "course" is too thin to sell on its own, so the deterministic
// path never produces one and the repair merges away anything smaller.
const MIN_TOPICS_PER_GROUP = 3;

const MAX_DESCRIPTION_CHARS = 240;

export interface ProposedCourseGroup {
  /** 0-based position among the groups. Becomes lesson_courses.order_index. */
  orderIndex: number;
  /** Azerbaijani course title. Model-suggested or derived; admin-editable. */
  title: string;
  /** One short sentence, or null when neither the model nor the fallback set one. */
  description: string | null;
  /** Inclusive index into the source topic array — the group's first topic. */
  startTopic: number;
  /** Inclusive index into the source topic array — the group's last topic. */
  endTopic: number;
  /**
   * The real ProposedTopic objects, resolved by index. `orderIndex` on each is
   * still the DOCUMENT-wide position; the creation step renumbers from 0 per
   * course (see createCoursesWithTopics).
   */
  topics: ProposedTopic[];
  /** Sum of the group's topic char counts — the admin's "too big/small" signal. */
  charCount: number;
}

export interface CourseGroupProposal {
  documentId: string;
  documentTitle: string;
  groups: ProposedCourseGroup[];
  /**
   * Which strategy produced `groups`. 'deterministic' after an AI failure is
   * not something the admin should have to guess at — the mechanical split cuts
   * on topic count alone and its titles are borrowed from the first topic.
   */
  source: 'ai' | 'deterministic';
  /** Human-readable, Azerbaijani. Set when the AI pass failed or was repaired. */
  warning?: string;
}

const groupsSchema = z.object({
  courses: z
    .array(
      z.object({
        startTopic: z.number().int(),
        endTopic: z.number().int(),
        title: z.string(),
        description: z.string().optional(),
      })
    )
    .default([]),
});

const GROUPING_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə onlayn tədris platformasının proqram rəhbərisən. Sənə bir rəsmi sənədin artıq hazırlanmış DƏRS MÖVZULARININ ardıcıl siyahısı veriləcək: hər sətir bir mövzudur və özündə mövzunun nömrəsini (topicIndex), başlığını və simvol sayını saxlayır.

Vəzifən: bu mövzuları ardıcıl qruplara — AYRI-AYRI KURSLARA — bölmək və hər kursa Azərbaycan dilində qısa, aydın ad vermək.

Qaydalar:
- Hər kurs yalnız ARDICIL mövzulardan ibarət olmalıdır. Mövzuların sırasını dəyişmə, atlama və təkrarlama.
- Siyahıdakı HƏR mövzu mütləq bir kursa daxil olmalıdır — heç bir mövzu kənarda qalmamalıdır.
- Kurslar üst-üstə düşməməlidir: bir mövzu yalnız bir kursa aid ola bilər.
- Kursların sayı ${MAX_GROUPS}-dən çox olmamalıdır. Hər kursda təxminən ${MIN_TOPICS_PER_GROUP}-10 mövzu olsun; mövzu sayı azdırsa daha az kurs qaytar.
- Kurs adı öyrənən üçün mənalı mövzu qrupunu bildirməlidir ("Yol nişanları", "Kəsişmələrdən keçmə", "Dayanma və durma qaydaları" kimi). Sənəddə olmayan mövzu, maddə nömrəsi və ya fakt uydurma — adı yalnız verilən mövzu başlıqlarına əsasən yaz.
- description: bir cümləlik Azərbaycan dilində qısa təsvir. Əmin deyilsənsə, boş burax.`;

interface RawRange {
  startTopic: number;
  endTopic: number;
  title: string;
  description?: string;
}

/**
 * Forces the model's ranges into a contiguous, non-overlapping, complete cover
 * of [0, topicCount - 1]. Returns null only when there is nothing usable, in
 * which case the caller splits deterministically.
 *
 * Never drops a topic: gaps are absorbed into the following range and any tail
 * the model failed to assign is appended to the last range. Same rule and same
 * shape as repairGroups() in aiProposeTopics.ts — if one is ever fixed, check
 * the other.
 */
function repairRanges(raw: RawRange[], topicCount: number): RawRange[] | null {
  const sorted = [...raw]
    .filter((g) => Number.isInteger(g.startTopic) && Number.isInteger(g.endTopic))
    .sort((a, b) => a.startTopic - b.startTopic || a.endTopic - b.endTopic);

  const repaired: RawRange[] = [];
  const end = topicCount - 1;
  let cursor = 0;

  for (const range of sorted) {
    if (cursor > end) break;
    const rangeEnd = Math.min(Math.max(range.endTopic, cursor), end);
    // Fully consumed by an earlier range (overlap) — skip rather than reorder.
    if (rangeEnd < cursor) continue;
    repaired.push({
      startTopic: cursor,
      endTopic: rangeEnd,
      title: range.title,
      description: range.description,
    });
    cursor = rangeEnd + 1;
  }

  if (repaired.length === 0) return null;

  if (cursor <= end) {
    repaired[repaired.length - 1].endTopic = end;
  }

  return repaired;
}

/**
 * Merges adjacent ranges until there are at most MAX_GROUPS of them and none is
 * a runt. The model is asked for both bounds but is not trusted with them: 15
 * two-topic "courses" is the failure mode this exists to absorb, and merging
 * preserves coverage where discarding would not.
 */
function mergeUntilSane(ranges: RawRange[]): RawRange[] {
  const merged = [...ranges];
  const sizeOf = (r: RawRange) => r.endTopic - r.startTopic + 1;

  const mergeAt = (index: number) => {
    merged[index] = {
      startTopic: merged[index].startTopic,
      endTopic: merged[index + 1].endTopic,
      title: merged[index].title,
      description: merged[index].description,
    };
    merged.splice(index + 1, 1);
  };

  while (merged.length > MAX_GROUPS) {
    let best = 0;
    for (let i = 1; i < merged.length - 1; i += 1) {
      if (sizeOf(merged[i]) + sizeOf(merged[i + 1]) < sizeOf(merged[best]) + sizeOf(merged[best + 1])) {
        best = i;
      }
    }
    mergeAt(best);
  }

  // Runts fold into a neighbour, preferring the previous one so the earlier
  // (already-titled) course absorbs the fragment.
  for (let i = merged.length - 1; i >= 0 && merged.length > 1; i -= 1) {
    if (sizeOf(merged[i]) >= MIN_TOPICS_PER_GROUP) continue;
    if (i > 0) {
      mergeAt(i - 1);
    } else {
      mergeAt(0);
    }
  }

  return merged;
}

/**
 * How many courses a document of `topicCount` topics should become. Aims at
 * TARGET_TOPICS_PER_GROUP per course, refuses to produce runts, and caps at
 * MAX_GROUPS — 50 topics lands on 7, 20 lands on 3, 10 lands on 2.
 */
function desiredGroupCount(topicCount: number): number {
  if (topicCount <= MIN_TOPICS_PER_GROUP) return 1;
  const byDensity = Math.max(1, Math.round(topicCount / TARGET_TOPICS_PER_GROUP));
  const byFloor = Math.floor(topicCount / MIN_TOPICS_PER_GROUP);
  const count = Math.min(byDensity, byFloor, MAX_GROUPS);
  // A document big enough for two real courses should not come back as one.
  return count === 1 && topicCount >= 2 * MIN_TOPICS_PER_GROUP ? 2 : Math.max(1, count);
}

/**
 * Resolves the group count for the deterministic path: the admin's explicit
 * number when there is one, desiredGroupCount()'s heuristic otherwise.
 *
 * AN EXPLICIT COUNT DELIBERATELY BYPASSES MAX_GROUPS (and every other
 * heuristic here). "Mexaniki bölgü" was mechanical but still automatic — the
 * program picked the count and the admin could not influence it, which is the
 * complaint this exists to answer. MAX_GROUPS/MIN_TOPICS_PER_GROUP are taste
 * for the automatic path, not structural limits; the only real bounds are "at
 * least one course" and "no more courses than there are topics" (evenRanges
 * would otherwise emit empty groups). Same reason mergeUntilSane() is NOT
 * applied on this path: it would squeeze the count back toward 8.
 *
 * Untrusted input — this number originates in a server action's arguments.
 * Non-numeric / non-finite values fall back to the automatic count rather than
 * clamping to 1, so a broken client cannot silently collapse a document into a
 * single course.
 */
function resolveGroupCount(topicCount: number, requested?: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) {
    return desiredGroupCount(topicCount);
  }
  return Math.min(Math.max(Math.floor(requested), 1), Math.max(topicCount, 1));
}

/** Even split by topic COUNT — topics are already size-normalised upstream. */
function evenRanges(topics: ProposedTopic[], groupCount: number): RawRange[] {
  const ranges: RawRange[] = [];
  const base = Math.floor(topics.length / groupCount);
  const remainder = topics.length % groupCount;

  let cursor = 0;
  for (let i = 0; i < groupCount; i += 1) {
    const size = base + (i < remainder ? 1 : 0);
    if (size === 0) continue;
    ranges.push({
      startTopic: cursor,
      endTopic: cursor + size - 1,
      title: '',
      description: undefined,
    });
    cursor += size;
  }

  return ranges;
}

function cleanDescription(value: string | undefined): string | null {
  const clean = value?.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > MAX_DESCRIPTION_CHARS
    ? `${clean.slice(0, MAX_DESCRIPTION_CHARS - 1)}…`
    : clean;
}

function materialise(ranges: RawRange[], topics: ProposedTopic[]): ProposedCourseGroup[] {
  const groups: ProposedCourseGroup[] = [];

  for (const range of ranges) {
    const slice = topics.slice(range.startTopic, range.endTopic + 1);
    if (slice.length === 0) continue;

    const fallbackTitle = slice[0]?.title ?? '';
    groups.push({
      orderIndex: groups.length,
      title: truncateTitle(range.title.trim() || fallbackTitle || `Bölmə ${groups.length + 1}`),
      description: cleanDescription(range.description),
      startTopic: range.startTopic,
      endTopic: range.endTopic,
      topics: slice,
      charCount: slice.reduce((sum, t) => sum + t.charCount, 0),
    });
  }

  return groups;
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
}

function deterministicProposal(
  proposal: TopicProposal,
  warning?: string,
  groupCount?: number
): CourseGroupProposal {
  const ranges = evenRanges(
    proposal.topics,
    resolveGroupCount(proposal.topics.length, groupCount)
  );
  return {
    documentId: proposal.documentId,
    documentTitle: proposal.documentTitle,
    groups: materialise(ranges, proposal.topics),
    source: 'deterministic',
    warning,
  };
}

/**
 * Groups an existing topic proposal into 6-8 (fewer for small documents)
 * consecutive course groups. ONE structured LLM call over a title-only outline;
 * never throws, never returns an empty group list for a proposal that has
 * topics.
 *
 * `useAi = false` skips the model entirely — both an escape hatch for the admin
 * and exactly the path an AI failure degrades to.
 *
 * `groupCount` is the admin's explicit course count for the mechanical split.
 * Omitted (the default, and every pre-existing caller) reproduces the previous
 * desiredGroupCount() behaviour exactly. It only reaches the deterministic
 * splitter — including the one an AI failure degrades to; the model's own
 * grouping prompt is untouched by it.
 */
export async function groupTopicsIntoCourses(
  proposal: TopicProposal,
  useAi = true,
  groupCount?: number
): Promise<CourseGroupProposal> {
  if (proposal.topics.length === 0) {
    return {
      documentId: proposal.documentId,
      documentTitle: proposal.documentTitle,
      groups: [],
      source: 'deterministic',
    };
  }

  if (!useAi) return deterministicProposal(proposal, undefined, groupCount);

  // Titles and sizes only — the outline for 50 topics is ~50 short lines, which
  // is why this fits in a single call where the topic pass needed batching.
  const outline = proposal.topics
    .map((topic, index) => `#${index} | ${topic.title} | ${topic.charCount} simvol`)
    .join('\n');

  let raw: RawRange[];
  try {
    const { object } = await generateObjectWithRouting(getRewriteModelChain(), groupsSchema, {
      system: GROUPING_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `Sənəd: ${proposal.documentTitle}\nMövzu sayı: ${proposal.topics.length}\nTövsiyə olunan kurs sayı: ${desiredGroupCount(proposal.topics.length)}\n\nMövzular:\n${outline}`,
    });
    raw = object.courses;
  } catch (error) {
    void logError('lessons.groupTopicsIntoCourses.call', error, {
      details: { documentId: proposal.documentId },
    });
    console.error('[lessons/groupTopicsIntoCourses] grouping call failed:', error);
    return deterministicProposal(
      proposal,
      `Kurs qruplaşdırması üçün AI cavabı alınmadı, bərabər mexaniki bölgü göstərilir. Xəta: ${getRewriteModelId()}: ${describeError(error)}`,
      groupCount
    );
  }

  const repaired = repairRanges(raw, proposal.topics.length);
  if (!repaired) {
    return deterministicProposal(
      proposal,
      'AI etibarlı kurs bölgüsü qaytarmadı, bərabər mexaniki bölgü göstərilir.',
      groupCount
    );
  }

  const sane = mergeUntilSane(repaired);

  const notes: string[] = [];
  const emittedExactly =
    repaired.length === raw.length &&
    repaired.every(
      (r, i) => r.startTopic === raw[i]?.startTopic && r.endTopic === raw[i]?.endTopic
    );
  if (!emittedExactly) notes.push('Kurs sərhədləri avtomatik düzəldildi');
  if (sane.length !== repaired.length) {
    notes.push(`${repaired.length} kurs təklifi ${sane.length} kursa birləşdirildi`);
  }

  const groups = materialise(sane, proposal.topics);
  if (groups.length === 0) {
    return deterministicProposal(
      proposal,
      'AI etibarlı kurs bölgüsü qaytarmadı, bərabər mexaniki bölgü göstərilir.',
      groupCount
    );
  }

  return {
    documentId: proposal.documentId,
    documentTitle: proposal.documentTitle,
    groups,
    source: 'ai',
    warning: notes.length > 0 ? `${notes.join('. ')}.` : undefined,
  };
}
