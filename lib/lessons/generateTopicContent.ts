import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getChatModel, getRewriteModel, getProviderCallOptions } from '@/lib/llm';
import { createAdminClient } from '@/lib/supabase/admin';

// Per-TOPIC content generation: reading material + a question pool, drafted
// from the chunks that topic covers.
//
// ONE TOPIC PER CALL, ALWAYS. This is a hard constraint, not a style choice: a
// 48-page document proposes 20+ topics, and each topic needs a prose draft plus
// up to 20 four-option questions. Generating a whole document in one request
// would blow Vercel's maxDuration (300s ceiling on Hobby) somewhere in the
// middle and lose everything already generated. The exported functions
// therefore take a single topic and the caller (an admin UI loop) drives them
// one at a time with visible progress — resumable, and a failure costs one
// topic's work rather than a document's.
//
// Reading content and questions are also two SEPARATE calls for the same
// reason: they are the two halves of the work, each independently retryable,
// and a model that has to emit both in one structured object tends to
// shortchange one of them.
//
// GROUNDING. Same posture as lib/rag/buildPrompt.ts and
// lib/quiz/generateQuestionsFromPdf.ts: only what the supplied chunks
// literally support, skip rather than invent. This material is presented to
// learners as traffic law — a plausible-sounding invented article number or
// fine amount is exactly the failure this app exists to prevent, and it is
// worse here than in chat because the output is persisted and shown to many
// users. Nothing generated here is ever auto-published; lesson_topics.status
// and quiz_questions.status both default to 'draft' and an admin must approve.

export interface TopicSourceChunk {
  id: string;
  content: string;
  articleLabel: string | null;
  pageNumber: number | null;
}

export interface TopicCitation {
  chunk_id: string;
  article_label: string | null;
  page_number: number | null;
}

// Bounds the worst-case prompt for a topic whose chunks are unexpectedly large
// (a proposal an admin has hand-edited to be enormous). Same rationale as
// generateQuestionsFromPdf's MAX_SOURCE_CHARS, sized to one topic.
const MAX_SOURCE_CHARS = 24000;

function buildSourceText(chunks: TopicSourceChunk[]): string {
  const parts: string[] = [];
  let used = 0;

  for (const chunk of chunks) {
    const label = chunk.articleLabel ?? 'Mənbə';
    const page = chunk.pageNumber !== null ? `, səh. ${chunk.pageNumber}` : '';
    const block = `[${label}${page}]\n${chunk.content}`;
    if (used + block.length > MAX_SOURCE_CHARS) break;
    parts.push(block);
    used += block.length;
  }

  return parts.join('\n\n');
}

export function buildCitations(chunks: TopicSourceChunk[]): TopicCitation[] {
  return chunks.map((chunk) => ({
    chunk_id: chunk.id,
    article_label: chunk.articleLabel,
    page_number: chunk.pageNumber,
  }));
}

const readingContentSchema = z.object({
  title: z.string(),
  content: z.string(),
  /**
   * The article labels the model actually used. Advisory only — the persisted
   * citations are built from the real chunk rows (buildCitations), never from
   * this, for the same reason messages.citations is built from retrieval
   * results and never parsed out of the model's text.
   */
  usedArticleLabels: z.array(z.string()).default([]),
});

export type GeneratedTopicContent = z.infer<typeof readingContentSchema>;

const READING_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə dərs materialı hazırlayan köməkçisən. Sənə rəsmi sənədin bir bölməsinin mətni veriləcək. Vəzifən bu mətnə əsaslanan, öyrənmək üçün nəzərdə tutulmuş izahlı dərs materialı yazmaqdır.

Qaydalar:
- Bütün mətni Azərbaycan dilində yaz.
- YALNIZ verilən mətndə HƏRFİ VƏ AYDIN ŞƏKİLDƏ dəstəklənən məlumatlara əsaslan. Heç vaxt mətndə olmayan fakt, rəqəm, cərimə məbləği, müddət və ya maddə nömrəsi uydurma — hətta ümumi biliyinlə doğru olduğunu düşünsən belə.
- Əgər mətnin hansısa hissəsi qeyri-aydındırsa və ya dərs materialına çevirmək üçün kifayət etmirsə, o hissəni SADƏCƏ BURAX. Az, lakin etibarlı material yazmaq, çox, lakin şübhəli material yazmaqdan daha yaxşıdır.
- Rəsmi mətni sadəcə köçürmə — onu izah et: qısa abzaslar, aydın dil, lazım olduqda sadalama işlət. Amma izah edərkən də mətndəki məzmundan kənara çıxma.
- Konkret qaydadan danışarkən mənbə maddəni mətndə göstərildiyi kimi qeyd et (məsələn "Maddə 45"), belə ki oxuyan mənbəyə qayıda bilsin.
- Başlıq (title) qısa və mövzunu dəqiq təsvir edən olmalıdır.
- Mətndə dərs materialı üçün yararlı heç nə yoxdursa, content sahəsini boş sətir kimi qaytar.`;

// Reading material is prose, not structured extraction, so it uses the main
// chat model rather than the small/cheap rewrite model — the same quality bar
// as a user-facing chat answer applies, since this is the text learners read.
export async function generateTopicReadingContent(
  topicTitle: string,
  chunks: TopicSourceChunk[]
): Promise<GeneratedTopicContent | null> {
  const sourceText = buildSourceText(chunks);
  if (!sourceText.trim()) return null;

  try {
    const { object } = await generateObject({
      model: getChatModel(),
      schema: readingContentSchema,
      system: READING_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `Mövzunun təxmini adı: ${topicTitle}\n\nSənədin bu mövzuya aid hissəsi:\n"""\n${sourceText}\n"""`,
    });

    return object;
  } catch (error) {
    console.error('[lessons/generateTopicContent] reading content generation failed:', error);
    return null;
  }
}

const generatedQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().int().min(0).max(3),
  explanation: z.string().optional(),
});

export type GeneratedTopicQuestion = z.infer<typeof generatedQuestionSchema>;

const generatedQuestionsSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

export const TOPIC_POOL_MIN = 15;
export const TOPIC_POOL_MAX = 20;

const QUESTIONS_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə test sualları hazırlayan köməkçisən. Sənə bir dərs mövzusunun mənbə mətni veriləcək. Vəzifən bu mətndən YALNIZ mətndə HƏRFİ VƏ AYDIN ŞƏKİLDƏ dəstəklənən faktlara əsaslanan çoxseçimli test sualları hazırlamaqdır.

Qaydalar:
- ${TOPIC_POOL_MIN}-${TOPIC_POOL_MAX} sual hazırla. Hamısı bu mövzunun mənbə mətninə aid olmalıdır.
- Hər sual dəqiq 4 cavab variantından ibarət olmalıdır, yalnız biri düzgündür.
- Sualı və bütün variantları Azərbaycan dilində yaz.
- Yalnız verilən mətndə birbaşa dəstəklənən faktlara, rəqəmlərə, maddə nömrələrinə və qaydalara əsaslan. Heç vaxt mətndə olmayan fakt, rəqəm və ya qayda uydurma — hətta ümumi biliyinlə doğru olduğunu düşünsən belə.
- Əgər mətn hansısa alt-mövzuda dəqiq/etibarlı sual yaratmaq üçün kifayət qədər aydın deyilsə, o alt-mövzunu SADƏCƏ BURAX — ${TOPIC_POOL_MIN}-dən az, lakin etibarlı sual qaytarmaq, tələb olunan sayı doldurmaq üçün şübhəli sual uydurmaqdan daha yaxşıdır.
- Sualları təkrarlama — hər sual mətnin fərqli bir hissəsini yoxlamalıdır.
- Yanlış cavab variantları da mövzu ilə əlaqəli və məntiqli olmalıdır (aşkar səhv və ya əlaqəsiz variantlar yazma), amma mətnə əsasən aydın şəkildə səhv olmalıdırlar.
- Hər sual üçün qısa izah (explanation) yaz — bu da yalnız mətndəki məlumata əsaslanmalıdır.
- Mətndə heç bir etibarlı sual mövzusu yoxdursa, boş bir siyahı qaytar.`;

// Structured extraction rather than prose — the small/cheap model, matching
// generateQuestionsFromPdf's choice.
//
// The prompt asks for 15-20 but the model may return fewer; that is DELIBERATE
// and must not be "fixed" by relaxing the grounding rules to pad the count. The
// caller reports the shortfall so an admin can regenerate or write the
// remainder by hand. It IS truncated at TOPIC_POOL_MAX, since an over-long
// pool is just noise.
export async function generateTopicQuestions(
  topicTitle: string,
  chunks: TopicSourceChunk[]
): Promise<GeneratedTopicQuestion[]> {
  const sourceText = buildSourceText(chunks);
  if (!sourceText.trim()) return [];

  try {
    const { object } = await generateObject({
      model: getRewriteModel(),
      schema: generatedQuestionsSchema,
      system: QUESTIONS_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `Mövzu: ${topicTitle}\n\nMənbə mətni:\n"""\n${sourceText}\n"""`,
    });

    // Belt-and-braces over the zod schema: a malformed option array reaching
    // the DB would violate quiz_questions' jsonb_array_length check and fail
    // the whole insert batch, losing the valid questions alongside it.
    return object.questions
      .filter(
        (q) =>
          q.options.length === 4 &&
          q.correctIndex >= 0 &&
          q.correctIndex <= 3 &&
          q.question.trim().length > 0
      )
      .slice(0, TOPIC_POOL_MAX);
  } catch (error) {
    console.error('[lessons/generateTopicContent] question generation failed:', error);
    return [];
  }
}

// Loads the source chunks a topic's citations point at, for REgeneration.
// Falls back to nothing (not to "some other chunks") when a citation dangles:
// source_citations is a snapshot and chunk_id is not a foreign key, so a
// re-ingested document can leave stale ids behind. Regenerating from a
// partially-resolved source is preferable to silently regenerating from the
// wrong text, so the resolved subset is returned and the caller can compare
// lengths.
export async function loadChunksByIds(chunkIds: string[]): Promise<TopicSourceChunk[]> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await createAdminClient()
    .from('chunks')
    .select('id, content, article_label, page_number')
    .in('id', chunkIds);

  if (error || !data) {
    console.error('[lessons/generateTopicContent] loadChunksByIds failed:', error);
    return [];
  }

  // `in` does not preserve the requested order, and document order is what
  // makes the generated material read coherently — restore it explicitly.
  const orderById = new Map(chunkIds.map((id, index) => [id, index]));
  return data
    .map((row) => ({
      id: row.id as string,
      content: row.content as string,
      articleLabel: (row.article_label as string | null) ?? null,
      pageNumber: (row.page_number as number | null) ?? null,
    }))
    .sort((a, b) => (orderById.get(a.id) ?? 0) - (orderById.get(b.id) ?? 0));
}
