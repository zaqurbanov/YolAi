import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getRewriteModel, getRewriteModelId, getProviderCallOptions } from '@/lib/llm';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildCitations,
  loadChunksByIds,
  type TopicCitation,
  type TopicSourceChunk,
} from '@/lib/lessons/generateTopicContent';
import { listCourseTopics, type LessonTopicRow } from '@/lib/lessons/courses';
import { truncateTitle } from '@/lib/lessons/proposeTopics';

// Splitting one topic into N parts.
//
// THE ADMIN CHOOSES THE COUNT, THE SYSTEM ADVISES IT. suggestTopicSplit() runs
// one cheap structured LLM call to recommend a part count and (optionally)
// where the seams fall; previewTopicSplit() recomputes the seams at whatever
// count the admin actually picked, with NO LLM call, so the slider in the UI is
// instant. Neither writes anything. splitTopic() is the only write.
//
// SEAMS ARE CHUNK BOUNDARIES, ALWAYS. A part is a consecutive run of the
// topic's existing chunk rows. Never mid-chunk, never mid-sentence — chunk
// boundaries are already sentence-aware from lib/ingestion/chunkText.ts. That
// also makes maxParts exactly the chunk count: you cannot have more parts than
// there are chunks to distribute.
//
// CHUNK IDS ARE RESOLVED FROM REAL ROWS, NEVER FROM THE MODEL. The model only
// ever returns integers (a count, and seam positions) and titles. Every chunk
// id in a part comes from loadChunksByIds() over the parent topic's own
// citations, in document order.
//
// ---------------------------------------------------------------------------
// WHAT HAPPENS TO THE PARENT'S GENERATED MATERIAL — the deliberate decision:
//
//   * A PUBLISHED topic is NEVER split. It is live material a learner may be
//     mid-way through, with published questions and user_topic_progress /
//     lesson_attempts rows pointing at it. Splitting would delete the row and
//     cascade all of that away underneath them. The admin must unpublish (or
//     duplicate) first; refusing is the only honest answer.
//
//   * The parent's reading CONTENT is discarded. It was generated against the
//     whole chunk set; each part now covers a strict subset, so the text no
//     longer matches any part. Carrying it onto part 0 (or all parts) would
//     produce material that cites articles the part does not contain — exactly
//     the grounding failure this pipeline exists to prevent. Parts are created
//     with content = null and must be regenerated.
//
//   * The parent's DRAFT questions are DELETED with the parent row (the
//     quiz_questions.topic_id FK is `on delete cascade` in 0060). They were
//     drawn from the whole topic and there is no sound way to reassign one to a
//     part — a question's source chunk is not recorded, only its topic. Leaving
//     them would mean dangling topic_ids or questions attached to a part that
//     does not contain their answer. Since the topic must be a draft to get
//     here, no published question is ever removed by this path.
//
// Net effect: split, then regenerate content + questions per part. The admin is
// told this up front by the UI; it is not a surprise.
// ---------------------------------------------------------------------------

export interface TopicSplitPart {
  /** 0-based position within the split. Becomes part of the reflowed order. */
  partIndex: number;
  /** Azerbaijani. Model-suggested at the advised count, derived otherwise. */
  title: string;
  /** Resolved from real chunk rows, in document order. Never model-emitted. */
  chunkIds: string[];
  charCount: number;
  preview: string;
}

export interface TopicSplitAdvice {
  topicId: string;
  /** What the system advises. Always >= 2 and <= maxParts. */
  recommendedParts: number;
  /** Hard ceiling: the topic's resolvable chunk count. */
  maxParts: number;
  /** One sentence, Azerbaijani, explaining the recommendation. */
  reason: string;
  /** The boundaries AT recommendedParts. */
  parts: TopicSplitPart[];
}

const PREVIEW_CHARS = 200;
// Advising more than this is never useful in the UI and keeps the model's
// output in a sane range; the admin can still pick any count up to maxParts.
const MAX_ADVISED_PARTS = 8;

const adviceSchema = z.object({
  recommendedParts: z.number().int(),
  reason: z.string(),
  /**
   * Chunk positions (1-based, within this topic) at which a NEW part begins.
   * Advisory: validated and discarded if inconsistent. Never a source of ids.
   */
  boundaries: z.array(z.number().int()).default([]),
  titles: z.array(z.string()).default([]),
});

const ADVICE_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə onlayn kursun proqramını quran metodistsən. Sənə bir dərs mövzusunun mənbə mətni ardıcıl parçalar (chunk) şəklində veriləcək. Hər parça nömrələnib.

Vəzifən: bu mövzunun neçə ayrı dərsə bölünməsinin metodik cəhətdən daha düzgün olduğunu tövsiyə etmək.

Qaydalar:
- recommendedParts: 2-dən kiçik olmamalı və verilən parça sayından böyük olmamalıdır. Mövzu artıq bütöv və bölünməyə ehtiyacı yoxdursa, ən kiçik məntiqli dəyəri (2) qaytar.
- boundaries: yeni hissənin BAŞLADIĞI parça nömrələri (1-əsaslı), artan sırada, təkrarsız. Sayı tam olaraq recommendedParts - 1 olmalıdır. Sərhədləri mövzunun məzmunca dəyişdiyi yerlərdə seç.
- titles: hər hissə üçün qısa Azərbaycan dilində başlıq, sayı tam olaraq recommendedParts olmalıdır. Başlıq yalnız həmin hissədəki mətnə əsaslanmalıdır — mətndə olmayan mövzu və ya maddə nömrəsi uydurma.
- reason: bir cümləlik Azərbaycan dilində izah — niyə məhz bu sayda.`;

interface TopicRow {
  id: string;
  course_id: string;
  title: string;
  order_index: number;
  status: 'draft' | 'published';
  source_citations: TopicCitation[] | null;
}

interface LoadedTopic {
  row: TopicRow;
  chunks: TopicSourceChunk[];
}

async function loadTopic(
  topicId: string
): Promise<{ ok: true; topic: LoadedTopic } | { ok: false; error: string }> {
  const { data, error } = await createAdminClient()
    .from('lesson_topics')
    .select('id, course_id, title, order_index, status, source_citations')
    .eq('id', topicId)
    .maybeSingle<TopicRow>();

  if (error || !data) {
    console.error('[lessons/splitTopic] topic lookup failed:', error);
    return { ok: false, error: 'Mövzu tapılmadı' };
  }

  const chunkIds = (data.source_citations ?? []).map((c) => c.chunk_id).filter(Boolean);
  const chunks = await loadChunksByIds(chunkIds);

  if (chunks.length < 2) {
    return {
      ok: false,
      error: 'Bu mövzu bölünə bilməz — mənbə mətni yalnız bir hissədən ibarətdir',
    };
  }

  return { ok: true, topic: { row: data, chunks } };
}

function makePart(chunks: TopicSourceChunk[], partIndex: number, title: string | null): TopicSplitPart {
  const first = chunks[0]?.content ?? '';
  const labels = chunks.map((c) => c.articleLabel).filter((l): l is string => Boolean(l));
  const derived = labels[0] ?? first.replace(/\s+/g, ' ').trim().slice(0, 60);

  return {
    partIndex,
    title: truncateTitle(title?.trim() || derived || `Hissə ${partIndex + 1}`),
    chunkIds: chunks.map((c) => c.id),
    charCount: chunks.reduce((sum, c) => sum + c.content.length, 0),
    preview:
      first.length > PREVIEW_CHARS ? `${first.slice(0, PREVIEW_CHARS).trim()}…` : first.trim(),
  };
}

/**
 * Balanced seams by CHARACTER weight (not by chunk count): chunks here vary
 * from ~30 chars to ~3200, so an even chunk split would produce wildly uneven
 * lessons. Every part is guaranteed at least one chunk.
 */
function evenSeams(chunks: TopicSourceChunk[], partCount: number): number[] {
  const total = chunks.reduce((sum, c) => sum + c.content.length, 0);
  const seams: number[] = [];
  let running = 0;
  let target = total / partCount;

  for (let i = 0; i < chunks.length && seams.length < partCount - 1; i += 1) {
    running += chunks[i].content.length;
    const remainingChunks = chunks.length - (i + 1);
    const remainingSeams = partCount - 1 - seams.length;
    // Force a seam when otherwise there would not be enough chunks left to
    // give every remaining part at least one.
    if (running >= target || remainingChunks <= remainingSeams) {
      seams.push(i + 1);
      target = running + (total - running) / (partCount - seams.length);
    }
  }

  return seams;
}

function seamsToParts(
  chunks: TopicSourceChunk[],
  seams: number[],
  titles: string[]
): TopicSplitPart[] {
  const bounds = [0, ...seams, chunks.length];
  const parts: TopicSplitPart[] = [];

  for (let i = 0; i < bounds.length - 1; i += 1) {
    const slice = chunks.slice(bounds[i], bounds[i + 1]);
    if (slice.length === 0) continue;
    parts.push(makePart(slice, parts.length, titles[i] ?? null));
  }

  return parts;
}

/** Non-destructive, re-runnable. Deterministic seams; LLM advises the count. */
export async function suggestTopicSplit(
  topicId: string
): Promise<{ ok: true; advice: TopicSplitAdvice } | { ok: false; error: string }> {
  const loaded = await loadTopic(topicId);
  if (!loaded.ok) return loaded;

  const { chunks } = loaded.topic;
  const maxParts = chunks.length;

  let recommendedParts = Math.min(
    Math.max(2, Math.round(chunks.reduce((s, c) => s + c.content.length, 0) / 6000)),
    maxParts,
    MAX_ADVISED_PARTS
  );
  let reason = 'Mətnin həcminə görə hesablanmış bölgü (AI tövsiyəsi alınmadı).';
  let seams = evenSeams(chunks, recommendedParts);
  let titles: string[] = [];

  const numbered = chunks
    .map((c, i) => {
      const label = c.articleLabel ?? '—';
      const text = c.content.replace(/\s+/g, ' ').trim().slice(0, 220);
      return `#${i + 1} | ${label} | ${c.content.length} simvol | ${text}`;
    })
    .join('\n');

  try {
    const { object } = await generateObject({
      model: getRewriteModel(),
      schema: adviceSchema,
      system: ADVICE_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `Mövzu: ${loaded.topic.row.title}\nParça sayı: ${chunks.length}\n\nParçalar:\n${numbered}`,
    });

    const advised = Math.min(Math.max(2, object.recommendedParts), maxParts, MAX_ADVISED_PARTS);

    // The model emits 1-BASED chunk numbers ("part N begins at chunk B"), which
    // is what the prompt asks for and what it can count reliably; seamsToParts
    // consumes 0-based slice offsets. The `- 1` is that conversion — do not
    // drop it, the two conventions differ by exactly one chunk.
    //
    // The seams are used only if they are internally consistent AND land
    // strictly inside the chunk range in increasing order. Anything else falls
    // back to the balanced seams — the count survives, the boundaries don't,
    // which is the safe half to keep.
    const proposed = [...new Set(object.boundaries)]
      .filter((b) => Number.isInteger(b) && b >= 2 && b <= chunks.length)
      .sort((a, b) => a - b)
      .map((b) => b - 1);

    recommendedParts = advised;
    seams = proposed.length === advised - 1 ? proposed : evenSeams(chunks, advised);
    titles = object.titles.length === advised ? object.titles : [];
    reason = object.reason.replace(/\s+/g, ' ').trim() || reason;
  } catch (error) {
    console.error('[lessons/splitTopic] split advice failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    const clean = message.replace(/\s+/g, ' ').trim().slice(0, 300);
    reason = `AI tövsiyəsi alınmadı (${getRewriteModelId()}: ${clean}) — həcmə görə hesablanmış bölgü göstərilir.`;
    recommendedParts = Math.min(recommendedParts, maxParts);
    seams = evenSeams(chunks, recommendedParts);
  }

  return {
    ok: true,
    advice: {
      topicId,
      recommendedParts,
      maxParts,
      reason,
      parts: seamsToParts(chunks, seams, titles),
    },
  };
}

/** Recomputed at the admin's chosen count. No LLM call, no writes. */
export async function previewTopicSplit(
  topicId: string,
  partCount: number
): Promise<{ ok: true; parts: TopicSplitPart[] } | { ok: false; error: string }> {
  const loaded = await loadTopic(topicId);
  if (!loaded.ok) return loaded;

  const { chunks } = loaded.topic;
  const validation = validatePartCount(partCount, chunks.length);
  if (!validation.ok) return validation;

  return { ok: true, parts: seamsToParts(chunks, evenSeams(chunks, partCount), []) };
}

function validatePartCount(
  partCount: number,
  maxParts: number
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(partCount) || partCount < 2) {
    return { ok: false, error: 'Mövzu ən azı 2 hissəyə bölünməlidir' };
  }
  if (partCount > maxParts) {
    return {
      ok: false,
      error: `Bu mövzu ən çox ${maxParts} hissəyə bölünə bilər (mənbə mətni ${maxParts} parçadan ibarətdir)`,
    };
  }
  return { ok: true };
}

/**
 * Performs the split. Replaces the one topic with `partCount` draft topics and
 * reflows order_index for the whole course.
 *
 * ORDER OF OPERATIONS matters and is not arbitrary:
 *   1. insert the parts at temporary, deliberately out-of-range order_index
 *      values, so nothing collides with the existing rows;
 *   2. only then delete the parent (its draft questions cascade with it);
 *   3. reflow the whole course through the reorder_lesson_topics RPC.
 * Inserting first means a failed insert loses nothing. Steps 2-3 are separate
 * transactions, so a crash between them leaves the parts parked at high indexes
 * — visible and re-orderable in the admin UI, never a lost topic.
 *
 * The reflow MUST go through the RPC: lesson_topics' unique
 * (course_id, order_index) is DEFERRABLE INITIALLY DEFERRED specifically so a
 * permutation can be written in one transaction. N PostgREST updates are N
 * transactions and would collide on the first swap (see 0060).
 */
export async function splitTopic(
  topicId: string,
  partCount: number
): Promise<{ ok: true; topics: LessonTopicRow[] } | { ok: false; error: string }> {
  const loaded = await loadTopic(topicId);
  if (!loaded.ok) return loaded;

  const { row, chunks } = loaded.topic;

  if (row.status === 'published') {
    return {
      ok: false,
      error:
        'Dərc edilmiş mövzu bölünə bilməz — əvvəlcə onu qaralamaya qaytarın (öyrənənlərin irəliləyişi bu mövzuya bağlıdır)',
    };
  }

  const validation = validatePartCount(partCount, chunks.length);
  if (!validation.ok) return validation;

  const parts = seamsToParts(chunks, evenSeams(chunks, partCount), []);
  if (parts.length < 2) return { ok: false, error: 'Bölgü hesablanmadı' };

  const admin = createAdminClient();

  const { data: courseTopics, error: listError } = await admin
    .from('lesson_topics')
    .select('id, order_index')
    .eq('course_id', row.course_id)
    .order('order_index', { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  if (listError || !courseTopics) {
    console.error('[lessons/splitTopic] course topic list failed:', listError);
    return { ok: false, error: 'Kursun mövzuları oxunmadı' };
  }

  // Park the new rows above every existing index. The constraint is on
  // (course_id, order_index), so any value no existing row holds is safe.
  const parkBase = Math.max(0, ...courseTopics.map((t) => t.order_index)) + 1000;
  const chunkById = new Map(chunks.map((c) => [c.id, c]));

  const { data: inserted, error: insertError } = await admin
    .from('lesson_topics')
    .insert(
      parts.map((part, index) => ({
        course_id: row.course_id,
        title: part.title,
        // Content is deliberately null — see the decision block at the top.
        content: null,
        source_citations: buildCitations(
          part.chunkIds
            .map((id) => chunkById.get(id))
            .filter((c): c is TopicSourceChunk => Boolean(c))
        ),
        order_index: parkBase + index,
        status: 'draft' as const,
      }))
    )
    .select('id')
    .returns<{ id: string }[]>();

  if (insertError || !inserted) {
    console.error('[lessons/splitTopic] part insert failed:', insertError);
    return { ok: false, error: 'Yeni hissələri yaratmaq uğursuz oldu' };
  }

  const { error: deleteError } = await admin.from('lesson_topics').delete().eq('id', topicId);

  if (deleteError) {
    console.error('[lessons/splitTopic] parent delete failed:', deleteError);
    return { ok: false, error: 'Köhnə mövzunu silmək uğursuz oldu' };
  }

  const finalOrder: string[] = [];
  for (const topic of courseTopics) {
    if (topic.id === topicId) {
      finalOrder.push(...inserted.map((r) => r.id));
      continue;
    }
    finalOrder.push(topic.id);
  }

  const { error: reorderError } = await admin.rpc('reorder_lesson_topics', {
    p_course_id: row.course_id,
    p_topic_ids: finalOrder,
  });

  if (reorderError) {
    console.error('[lessons/splitTopic] reorder failed:', reorderError);
    return { ok: false, error: 'Mövzu sırasını yeniləmək uğursuz oldu' };
  }

  return { ok: true, topics: await listCourseTopics(row.course_id) };
}
