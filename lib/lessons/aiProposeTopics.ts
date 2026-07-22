import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getRewriteModel, getRewriteModelId, getProviderCallOptions } from '@/lib/llm';
import {
  buildDocumentUnits,
  packUnitRuns,
  packUnitsIntoTopics,
  topicFromUnits,
  type ProposedTopic,
  type TopicProposal,
  type TopicUnit,
} from '@/lib/lessons/proposeTopics';

// AI topic breakdown: let the model decide where a document's topics begin and
// end, instead of packing chunks to a fixed character target.
//
// WHY IT IS AN OUTLINE PASS AND NOT "READ THE DOCUMENT"
// Documents here reach 517 chunks (~1.5M characters). No single prompt holds
// that, and no useful prompt should try. So the model never sees the document
// body: it sees an OUTLINE built from the deterministic candidate segmentation
// — one line per atomic unit (index, article label, size, opening text) — and
// its only job is to group CONSECUTIVE unit indices into pedagogically
// coherent topics and title each group in Azerbaijani.
//
// CHUNK IDS ARE NEVER MODEL-EMITTED. The model returns index ranges; the chunk
// ids, article labels, char counts and previews are resolved from the real unit
// rows by index (topicFromUnits). Same invariant as messages.citations: the
// model's text is never the source of record for anything that points at data.
//
// LOSING SOURCE TEXT IS THE FAILURE MODE THAT MATTERS. A dropped unit index is
// a course section that silently does not exist. Every batch's ranges are
// therefore validated for in-range / non-overlapping / contiguous / total
// coverage and REPAIRED to full coverage; a batch that cannot be repaired falls
// back to deterministic packing for exactly that batch, never to dropping it.
//
// BUDGET. One structured call per batch of OUTLINE_BATCH_UNITS units, capped at
// MAX_OUTLINE_BATCHES calls (count-bounded on purpose — this runs inside a
// server action under Vercel's 300s ceiling). 517 units ≈ 13 batches of small
// structured calls, which fits; anything beyond the cap is packed
// deterministically and reported through `warning` rather than silently
// truncated or left to time out.

const OUTLINE_BATCH_UNITS = 40;
// Tail of the previous batch shown as read-only context so the model doesn't
// start a new topic mid-section at a batch boundary. These units are NOT
// assignable in the current batch — they were already grouped.
const CONTEXT_TAIL_UNITS = 3;
const MAX_OUTLINE_BATCHES = 16;
const OUTLINE_SNIPPET_CHARS = 160;

// An AI group whose combined text exceeds this is re-packed deterministically:
// buildSourceText() in generateTopicContent.ts truncates a topic's prompt at
// MAX_SOURCE_CHARS, so an oversized topic would silently generate material from
// only its opening chunks. Bounding the group here is what keeps that from
// happening invisibly.
const MAX_AI_TOPIC_CHARS = 12000;

const outlineGroupsSchema = z.object({
  topics: z
    .array(
      z.object({
        startUnit: z.number().int(),
        endUnit: z.number().int(),
        title: z.string(),
      })
    )
    .default([]),
});

const OUTLINE_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə onlayn kursun proqramını (silabus) quran metodistsən. Sənə rəsmi sənədin ardıcıl "bölmə vahidləri" siyahısı veriləcək: hər sətir bir vahiddir və özündə vahidin nömrəsini (unitIndex), maddə etiketini, simvol sayını və mətnin ilk sətirlərini saxlayır.

Vəzifən: ardıcıl vahidləri məzmunca bir-birinə uyğun DƏRS MÖVZULARINA qruplaşdırmaq və hər mövzuya Azərbaycan dilində qısa, dəqiq başlıq vermək.

Qaydalar:
- Yalnız ARDICIL vahidləri birləşdir. Vahidlərin sırasını dəyişmə, atlamа və təkrarlama.
- Sənə verilən "təyin edilməli" aralıqdakı HƏR vahid mütləq bir mövzuya daxil olmalıdır — heç bir vahid kənarda qalmamalıdır.
- Mövzular üst-üstə düşməməlidir: bir vahid yalnız bir mövzuya aid ola bilər.
- Bir mövzu bir öyrənmə vahidi olmalıdır: mövzuya bir-biri ilə əlaqəli qaydalar düşməlidir. Çox kiçik (bir cümləlik) və ya həddindən artıq geniş mövzu yaratma. Ümumi simvol sayı təxminən 4000-10000 arasında olan mövzular idealdır.
- Başlıq mövzunun məzmununu təsvir etməlidir. Mətndə olmayan mövzu, maddə nömrəsi və ya fakt uydurma — başlığı yalnız verilən etiket və mətn parçalarına əsasən yaz.
- Yalnız təyin edilməli aralıqdakı nömrələri istifadə et. Kontekst üçün göstərilən əvvəlki vahidləri qruplaşdırma.`;

function outlineLine(unit: TopicUnit, index: number): string {
  const label = unit.label ?? '—';
  const snippet = unit.chunks[0]?.content
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OUTLINE_SNIPPET_CHARS);
  return `#${index} | ${label} | ${unit.charCount} simvol | ${snippet}`;
}

interface RawGroup {
  startUnit: number;
  endUnit: number;
  title: string;
}

/**
 * Forces the model's ranges into a contiguous, non-overlapping, complete cover
 * of [start, end]. Returns null only when there is nothing usable at all, in
 * which case the caller packs the batch deterministically.
 *
 * The repair never drops a unit: gaps are absorbed into the following group and
 * any tail the model failed to assign is appended to the last group.
 */
function repairGroups(raw: RawGroup[], start: number, end: number): RawGroup[] | null {
  const sorted = [...raw]
    .filter((g) => Number.isInteger(g.startUnit) && Number.isInteger(g.endUnit))
    .sort((a, b) => a.startUnit - b.startUnit || a.endUnit - b.endUnit);

  const repaired: RawGroup[] = [];
  let cursor = start;

  for (const group of sorted) {
    if (cursor > end) break;
    const groupEnd = Math.min(Math.max(group.endUnit, cursor), end);
    // Fully consumed by an earlier group (overlap) — skip rather than reorder.
    if (groupEnd < cursor) continue;
    repaired.push({ startUnit: cursor, endUnit: groupEnd, title: group.title });
    cursor = groupEnd + 1;
  }

  if (repaired.length === 0) return null;

  if (cursor <= end) {
    repaired[repaired.length - 1].endUnit = end;
  }

  return repaired;
}

/**
 * Splits any repaired group that is too large back into deterministic runs, so
 * a single AI "topic" can never exceed what one generation call can actually
 * read. Returns runs of units, in order.
 */
function groupsToUnitRuns(
  groups: RawGroup[],
  units: TopicUnit[]
): { run: TopicUnit[]; title: string | null }[] {
  const out: { run: TopicUnit[]; title: string | null }[] = [];

  for (const group of groups) {
    const run = units.slice(group.startUnit, group.endUnit + 1);
    if (run.length === 0) continue;

    const chars = run.reduce((sum, u) => sum + u.charCount, 0);
    if (chars <= MAX_AI_TOPIC_CHARS || run.length === 1) {
      out.push({ run, title: group.title });
      continue;
    }

    // Oversized: keep the model's boundary but re-pack the inside. The first
    // sub-run keeps the model's title; the rest fall back to derived titles so
    // three sections don't share one heading.
    const subRuns = packUnitRuns(run);
    subRuns.forEach((subRun, i) => {
      out.push({ run: subRun, title: i === 0 ? group.title : null });
    });
  }

  return out;
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const clean = message.replace(/\s+/g, ' ').trim();
  return clean.length > 300 ? `${clean.slice(0, 299)}…` : clean;
}

async function groupBatch(
  units: TopicUnit[],
  start: number,
  end: number
): Promise<{ ok: true; groups: RawGroup[] } | { ok: false; error: string }> {
  const contextStart = Math.max(0, start - CONTEXT_TAIL_UNITS);
  const contextLines = units
    .slice(contextStart, start)
    .map((unit, i) => outlineLine(unit, contextStart + i));
  const assignLines = units.slice(start, end + 1).map((unit, i) => outlineLine(unit, start + i));

  const contextBlock =
    contextLines.length > 0
      ? `Əvvəlki hissənin sonu (YALNIZ kontekst üçün, qruplaşdırma):\n${contextLines.join('\n')}\n\n`
      : '';

  try {
    const { object } = await generateObject({
      model: getRewriteModel(),
      schema: outlineGroupsSchema,
      system: OUTLINE_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `${contextBlock}Təyin edilməli vahidlər (#${start}–#${end}) — hamısı mövzulara bölünməlidir:\n${assignLines.join('\n')}`,
    });

    return { ok: true, groups: object.topics };
  } catch (error) {
    console.error('[lessons/aiProposeTopics] outline batch failed:', error);
    return { ok: false, error: `${getRewriteModelId()}: ${describeError(error)}` };
  }
}

/**
 * AI-decided topic breakdown for one document, with a wholesale deterministic
 * fallback. Never returns an empty topic list for a document that has chunks.
 */
export async function aiProposeTopicsForDocument(
  documentId: string
): Promise<TopicProposal | null> {
  const doc = await buildDocumentUnits(documentId);
  if (!doc) return null;

  const { units, documentTitle } = doc;

  if (units.length === 0) {
    return { documentId, documentTitle, topics: [], source: 'deterministic' };
  }

  const batches: { start: number; end: number }[] = [];
  for (let start = 0; start < units.length; start += OUTLINE_BATCH_UNITS) {
    batches.push({ start, end: Math.min(start + OUTLINE_BATCH_UNITS, units.length) - 1 });
  }

  const overBudget = batches.length > MAX_OUTLINE_BATCHES;
  const aiBatches = overBudget ? batches.slice(0, MAX_OUTLINE_BATCHES) : batches;

  const runs: { run: TopicUnit[]; title: string | null }[] = [];
  const failures: string[] = [];
  let repairedBatches = 0;

  // Sequential, not Promise.all: the same free-tier provider quota backs every
  // call and boundaries read better when batches are processed in order.
  for (const batch of aiBatches) {
    const result = await groupBatch(units, batch.start, batch.end);

    if (!result.ok) {
      failures.push(result.error);
      for (const run of packUnitRuns(units.slice(batch.start, batch.end + 1))) {
        runs.push({ run, title: null });
      }
      continue;
    }

    const repaired = repairGroups(result.groups, batch.start, batch.end);
    if (!repaired) {
      failures.push(`Model #${batch.start}–#${batch.end} aralığı üçün etibarlı bölgü qaytarmadı`);
      for (const run of packUnitRuns(units.slice(batch.start, batch.end + 1))) {
        runs.push({ run, title: null });
      }
      continue;
    }

    const emittedExactly =
      repaired.length === result.groups.length &&
      repaired.every(
        (g, i) => g.startUnit === result.groups[i]?.startUnit && g.endUnit === result.groups[i]?.endUnit
      );
    if (!emittedExactly) repairedBatches += 1;

    runs.push(...groupsToUnitRuns(repaired, units));
  }

  if (overBudget) {
    const remainderStart = aiBatches[aiBatches.length - 1].end + 1;
    for (const run of packUnitRuns(units.slice(remainderStart))) {
      runs.push({ run, title: null });
    }
  }

  // Every batch failed — there is nothing "AI" about the result, so say so
  // plainly rather than labelling a fully mechanical split as AI output.
  if (runs.length === 0 || failures.length === aiBatches.length) {
    return {
      documentId,
      documentTitle,
      topics: packUnitsIntoTopics(units),
      source: 'deterministic',
      warning:
        failures.length > 0
          ? `AI bölgüsü alınmadı, mexaniki bölgü göstərilir. Xəta: ${failures[0]}`
          : 'AI bölgüsü alınmadı, mexaniki bölgü göstərilir.',
    };
  }

  const topics: ProposedTopic[] = runs.map((entry, index) =>
    topicFromUnits(entry.run, index, entry.title)
  );

  const notes: string[] = [];
  if (failures.length > 0) {
    notes.push(
      `${failures.length} hissə üçün AI bölgüsü alınmadı, həmin hissələr mexaniki bölündü (${failures[0]})`
    );
  }
  if (repairedBatches > 0) {
    notes.push(`${repairedBatches} hissədə mövzu sərhədləri avtomatik düzəldildi`);
  }
  if (overBudget) {
    notes.push(
      `Sənəd çox böyükdür — ilk ${MAX_OUTLINE_BATCHES * OUTLINE_BATCH_UNITS} bölmə vahidi AI ilə, qalanı mexaniki bölündü`
    );
  }

  return {
    documentId,
    documentTitle,
    topics,
    source: 'ai',
    warning: notes.length > 0 ? notes.join('. ') : undefined,
  };
}
