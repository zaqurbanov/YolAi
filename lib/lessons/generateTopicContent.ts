import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import {
  getChatModel,
  getChatModelId,
  getRewriteModel,
  getRewriteModelId,
  getProviderCallOptions,
} from '@/lib/llm';
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
// ERRORS ARE NEVER SWALLOWED HERE. Both generators previously caught and
// returned null / [], which turned a hard provider failure (bad key, quota,
// schema rejection) into a silent no-op with only a console.error — the admin
// saw "material yaradılmadı" with no way to tell an unusable document from an
// expired API key. They now return a discriminated result carrying the model id
// and the provider's own message, and the server action renders it. That is
// acceptable to expose because every caller sits behind requireAdmin().
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

// OUTPUT FORMAT: a restricted Markdown subset — `##`/`###` headings, `-`
// bullets, `**bold**`, `>` blockquote, blank-line-separated paragraphs. No
// tables, no HTML, no code fences, no images. The learner-side topic reader
// does not exist yet (Phase 2), so this is the contract it must render; the
// admin editor shows the raw text in a textarea, which the subset stays legible
// in. Note this is DELIBERATELY the opposite of lib/rag/buildPrompt.ts, which
// forbids markdown — the chat transcript renders plain text, a lesson page does
// not.
//
// "ENGAGING" IS NOT A LICENCE TO INVENT. The whole reason this app exists is
// that a plausible-sounding invented fine, duration or article number is worse
// than no answer, and it is worse here than in chat because this text is
// persisted and read by many learners. The examples the prompt asks for are
// ILLUSTRATIONS of a rule that is literally in the source — never new rules,
// numbers or exceptions. That sentence is in the prompt itself, not just here.
const READING_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə onlayn kurs üçün DƏRS VƏSAİTİ yazan təcrübəli müəllimsən. Sənə rəsmi sənədin bir bölməsinin mətni veriləcək. Vəzifən həmin mətni oxumaq maraqlı və başa düşülən olan, yaxşı strukturlaşdırılmış dərs materialına çevirməkdir.

MÜTLƏQ ƏMƏL EDİLMƏLİ OLAN ƏSAS QAYDA — HEÇ NƏ UYDURMA:
- YALNIZ verilən mətndə HƏRFİ VƏ AYDIN ŞƏKİLDƏ dəstəklənən məlumatlara əsaslan.
- Mətndə olmayan maddə nömrəsi, cərimə məbləği, müddət, məsafə, sürət həddi, yaş həddi, faiz və ya hər hansı digər rəqəm və fakt YAZMA — hətta ümumi biliyinlə doğru olduğunu düşünsən belə.
- Materialı maraqlı etmək bəhanəsi ilə yeni qayda, istisna və ya nüans əlavə etmək QADAĞANDIR. Gətirdiyin nümunələr yalnız mətndəki qaydanın necə tətbiq olunduğunu göstərməlidir — nümunə heç vaxt yeni qayda gətirməməlidir.
- Mətnin hansısa hissəsi qeyri-aydındırsa və ya dərsə çevirmək üçün kifayət etmirsə, o hissəni SADƏCƏ BURAX. Az, lakin etibarlı material çox, lakin şübhəli materialdan yaxşıdır.
- Mətndə dərs üçün yararlı heç nə yoxdursa, content sahəsini boş sətir kimi qaytar.

DƏRSİN QURULUŞU (content sahəsi, Markdown):
1. Qısa giriş (2-4 cümlə): bu qaydanın nəyə aid olduğu və sürücü üçün praktikada niyə vacib olduğu. Yalnız mətndən çıxan məna əsasında.
2. "## " ilə başlayan bölmə başlıqları, lazım olduqda "### " ilə alt başlıqlar. Hər başlıq altında qısa abzaslar (2-4 cümlə).
3. Qaydaların özünü "- " ilə sadalama şəklində, aydın və qısa cümlələrlə ver. Ən vacib ifadələri **qalın** yaz.
4. Mümkün olduqda "### Nümunə" bölməsi: qaydanın gündəlik həyatda necə işlədiyini göstərən konkret, sadə səhnə (məsələn sürücünün hansısa vəziyyətdə nə etməli olduğu). Nümunə YALNIZ mətndəki qaydanı izah etməlidir.
5. Mətn ümumi səhvə və ya diqqət tələb edən məqama işarə edirsə, "> **Diqqət:** ..." formatında bir sitat bloku əlavə et. Mətn belə bir şeyə əsas vermirsə, bu bölməni tamamilə burax.
6. Sonda "## Yekun" başlığı altında 3-5 bənddən ibarət qısa xülasə.

ÜSLUB VƏ FORMAT:
- Hər şeyi Azərbaycan dilində yaz. Sadə, canlı, birbaşa oxucuya müraciət edən dil işlət ("siz" formasında). Quru rəsmi dildən qaç, amma məzmunu dəyişmə.
- Rəsmi mətni olduğu kimi köçürmə — izah et. Uzun hüquqi cümlələri qısa cümlələrə böl.
- Konkret qaydadan danışarkən mənbə maddəni mətndə göründüyü kimi mötərizədə qeyd et (məsələn "(Maddə 45)"), belə ki oxucu mənbəyə qayıda bilsin. Mətndə olmayan maddə nömrəsi yazma.
- Yalnız bu Markdown elementlərindən istifadə et: ## və ### başlıqlar, "- " sadalama, **qalın**, "> " sitat bloku, boş sətirlə ayrılmış abzaslar. Cədvəl, HTML, kod bloku və şəkil İSTİFADƏ ETMƏ.
- title sahəsi qısa (maksimum 8-10 söz) və mövzunu dəqiq təsvir edən olmalıdır.`;

export type TopicReadingOutcome =
  | { ok: true; content: GeneratedTopicContent }
  | { ok: false; error: string };

export type TopicQuestionsOutcome =
  | { ok: true; questions: GeneratedTopicQuestion[] }
  | { ok: false; error: string };

// Provider errors carry the useful diagnosis (401, rate limit, schema
// rejection) and this surface is admin-only, so the message is passed through
// verbatim — truncated, since some providers return a whole HTML page.
const MAX_ERROR_CHARS = 300;

function describeLlmError(modelId: string, error: unknown): string {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String(error);
  const clean = message.replace(/\s+/g, ' ').trim() || 'naməlum xəta';
  const truncated =
    clean.length > MAX_ERROR_CHARS ? `${clean.slice(0, MAX_ERROR_CHARS - 1)}…` : clean;
  return `${modelId}: ${truncated}`;
}

// Reading material is prose, not structured extraction, so it uses the main
// chat model rather than the small/cheap rewrite model — the same quality bar
// as a user-facing chat answer applies, since this is the text learners read.
export async function generateTopicReadingContent(
  topicTitle: string,
  chunks: TopicSourceChunk[]
): Promise<TopicReadingOutcome> {
  const sourceText = buildSourceText(chunks);
  if (!sourceText.trim()) {
    return { ok: false, error: 'Mövzunun mənbə mətni boşdur' };
  }

  try {
    const { object } = await generateObject({
      model: getChatModel(),
      schema: readingContentSchema,
      system: READING_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `Mövzunun təxmini adı: ${topicTitle}\n\nSənədin bu mövzuya aid hissəsi:\n"""\n${sourceText}\n"""`,
    });

    if (!object.content.trim()) {
      return {
        ok: false,
        error: 'Model bu mətndən dərs materialı çıxara bilmədi (boş nəticə qaytardı)',
      };
    }

    return { ok: true, content: object };
  } catch (error) {
    console.error('[lessons/generateTopicContent] reading content generation failed:', error);
    return { ok: false, error: `Dərs materialı yaradılmadı — ${describeLlmError(getChatModelId(), error)}` };
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
): Promise<TopicQuestionsOutcome> {
  const sourceText = buildSourceText(chunks);
  if (!sourceText.trim()) {
    return { ok: false, error: 'Mövzunun mənbə mətni boşdur' };
  }

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
    const questions = object.questions
      .filter(
        (q) =>
          q.options.length === 4 &&
          q.correctIndex >= 0 &&
          q.correctIndex <= 3 &&
          q.question.trim().length > 0
      )
      .slice(0, TOPIC_POOL_MAX);

    // Zero valid questions is reported as a failure, not as an empty success:
    // the caller would otherwise write nothing and tell the admin the run
    // succeeded. A genuinely question-less source and a model that returned
    // garbage are indistinguishable from here, and both need admin attention.
    if (questions.length === 0) {
      return { ok: false, error: 'Model bu mətndən etibarlı sual çıxara bilmədi' };
    }

    return { ok: true, questions };
  } catch (error) {
    console.error('[lessons/generateTopicContent] question generation failed:', error);
    return { ok: false, error: `Suallar yaradılmadı — ${describeLlmError(getRewriteModelId(), error)}` };
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
