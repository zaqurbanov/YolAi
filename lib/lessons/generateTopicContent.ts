import 'server-only';
import { z } from 'zod';
import {
  getLessonContentModelChain,
  getLessonContentModelId,
  getRewriteModelChain,
  getRewriteModelId,
  getProviderCallOptions,
} from '@/lib/llm';
import { generateObjectWithRouting } from '@/lib/llm/fallback';
import { createAdminClient } from '@/lib/supabase/admin';
import { logError } from '@/lib/logging/logError';

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
// tables, no HTML, no code fences, no images. The learner side renders this
// with components/LessonMarkdown.tsx, which implements exactly this subset; the
// admin editor shows the raw text in a textarea, which the subset stays legible
// in. Note this is DELIBERATELY the opposite of lib/rag/buildPrompt.ts, which
// forbids markdown — the chat transcript renders plain text, a lesson page does
// not.
//
// "ENGAGING" IS NOT A LICENCE TO INVENT. The whole reason this app exists is
// that a plausible-sounding invented fine, duration or article number is worse
// than no answer, and it is worse here than in chat because this text is
// persisted and read by many learners. The narrative framing the prompt asks
// for — each lesson is built around one everyday driving scene — is DECORATION,
// not facts: the scene can only ever illustrate rules that are literally in the
// source, never introduce new ones, and must never name invented people, places
// or specific events. That sentence is in the prompt itself, not just here.
const READING_SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə onlayn kurs üçün DƏRS VƏSAİTİ yazan təcrübəli müəllimsən. Sənə rəsmi sənədin bir bölməsinin mətni veriləcək. Vəzifən həmin mətni oxumaq MARAQLI və canlı — sanki sürücünün gündəlik həyatından bir səhnə kimi oxunan, amma yenə də tam dəqiq və etibarlı dərs materialına çevirməkdir. Məqsəd oxucunu quru qayda əzbərləməyə yox, real yol vəziyyətini başa düşməyə aparan dərs yazmaqdır.

MÜTLƏQ ƏMƏL EDİLMƏLİ OLAN ƏSAS QAYDA — HEÇ NƏ UYDURMA:
- YALNIZ verilən mətndə HƏRFİ VƏ AYDIN ŞƏKİLDƏ dəstəklənən məlumatlara əsaslan.
- Mətndə olmayan maddə nömrəsi, cərimə məbləği, müddət, məsafə, sürət həddi, yaş həddi, faiz və ya hər hansı digər rəqəm və fakt YAZMA — hətta ümumi biliyinlə doğru olduğunu düşünsən belə.
- HEKAYƏ FORMASI DEKORATİVDİR, FAKT DEYİL. Səhnə yalnız qaydanın gündəlik həyatda necə işlədiyini göstərən çərçivədir. Səhnəyə görə YENİ qayda, istisna və ya nüans əlavə etmək QADAĞANDIR. Səhnədəki bütün qaydalar, rəqəmlər və hərəkətlər mətnin özündən gəlməlidir.
- Ad, məkan adı, konkret hadisə və ya mətndə olmayan aydın vəziyyət uydurma. Səhnə yalnız sənə verilən SƏHNƏ ÇƏRÇİVƏSİNDƏN və ümumi gündəlik sürücülük şəraitindən ibarət ola bilər — səhnə heç vaxt mətndə olmayan fərziyyə yaratmamalıdır.
- Gətirdiyin nümunələr yalnız mətndəki qaydanın necə tətbiq olunduğunu göstərməlidir — nümunə heç vaxt yeni qayda gətirməməlidir.
- Mətnin hansısa hissəsi qeyri-aydındırsa və ya dərsə çevirmək üçün kifayət etmirsə, o hissəni SADƏCƏ BURAX. Az, lakin etibarlı material çox, lakin şübhəli materialdan yaxşıdır.
- Mətndə dərs üçün yararlı heç nə yoxdursa, content sahəsini boş sətir kimi qaytar.

DƏRSİN QURULUŞU (content sahəsi, Markdown) — DƏRS BİR GÜNDƏLİK SƏHNƏ ƏTRAFINDA QURULUR:
1. AÇILIŞ (2-4 cümlə, başlıqdan dərhal sonra, başlıqsız): oxucunu bu qaydanın hökm sürdüyü yol vəziyyətinə qoyan qısa, canlı səhnə. Oxucuya "sən" deyə müraciət et. Səhnə oxucunu maraqlandırmalı, amma heç bir yeni qayda gətirməməlidir.
   BİRİNCİ CÜMLƏ sənə verilən SƏHNƏ ÇƏRÇİVƏSİNİN özünü təsvir etməlidir — həmin çərçivədə göstərilən yerdən, yol tipindən və şəraitdən. Cümləni oxucunun etdiyi hərəkətlə və ya gördüyü mənzərə ilə aç. Günün vaxtı yalnız çərçivənin özündə varsa qeyd oluna bilər; çərçivədə yoxdursa, vaxtdan ümumiyyətlə danışma.
2. "## " bölmə başlıqları altında hekayə irəliləyir: hər bölmə səhnənin bir mərhələsini göstərir və o mərhələdə tətbiq olunan qaydaları sıx siyahı halında DEYİL, hərəkəti və onun səbəbini izah edən qısa abzaslarla (2-4 cümlə) verir. Qaydaları səhnənin axınına qur — oxucu qaydanı "nə etməliyəm" kimi deyil, "niyə belə edirəm" kimi başa düşməlidir. Ən vacib ifadələri **qalın** yaz.
3. Yalnız həqiqətən ardıcıl yoxlama tələb edən yerlərdə "- " sadalama işlət (məsələn addım-addım hərəkət sırası). Hər qaydanı siyahıya çevirmə.
4. Mümkün olduqda "### Niyə vacibdir" alt başlığı: qaydanın arxasındakı səbəbi izah et — yalnız mətndən çıxan mənaya əsaslanaraq.
5. Mətn ümumi səhvə və ya diqqət tələb edən məqama işarə edirsə, "> **Diqqət:** ..." formatında bir sitat bloku əlavə et. Mətn belə bir şeyə əsas vermirsə, bu bölməni tamamilə burax.
6. Sonda "## Yekun" başlığı altında 3-5 bənddən ibarət qısa xülasə (burada sadalama uyğundur).

ÜSLUB VƏ FORMAT:
- Hər şeyi Azərbaycan dilində yaz. Sadə, canlı, birbaşa oxucuya müraciət edən dil işlət ("sən/siz" formasında). Quru rəsmi dildən qaç, amma məzmunu dəyişmə.
- Rəsmi mətni olduğu kimi köçürmə — izah et. Uzun hüquqi cümlələri qısa cümlələrə böl.
- Konkret qaydadan danışarkən mənbə maddəni mətndə göründüyü kimi mötərizədə qeyd et (məsələn "(Maddə 45)"), belə ki oxucu mənbəyə qayıda bilsin. Mətndə olmayan maddə nömrəsi yazma.
- Yalnız bu Markdown elementlərindən istifadə et: ## və ### başlıqlar, "- " sadalama, **qalın**, "> " sitat bloku, boş sətirlə ayrılmış abzaslar. Cədvəl, HTML, kod bloku və şəkil İSTİFADƏ ETMƏ.
- title sahəsi qısa (maksimum 8-10 söz) və mövzunu dəqiq təsvir edən olmalıdır.`;

// SCENE ROTATION — why this exists.
//
// Every topic is generated by an INDEPENDENT model call: generateTopicReadingContent
// sees one topic and has no memory of the other 49 in the same course. Wording the
// prompt "vary your openings" therefore cannot work — there is nothing to vary
// against. Left to itself the model picks whatever opening the prompt makes most
// salient, and the prompt used to hand it one: the opening-sentence example was
// literally "Səhər tezdən məktəb rayonundan keçirsən...". Every lesson in a course
// came back starting "Səhər tezdən". That example is gone, but removing it only
// changes WHICH phrase gets over-used, so the caller now assigns each topic a
// concrete scene frame instead.
//
// TWO THINGS THAT DID NOT WORK, both removed — do not reintroduce either:
//
//   1. A BLACKLIST of banned openings ("Səhər tezdən", "Səhər saatlarında",
//      "Bir gün", …). Naming the phrase you don't want is negation priming: it
//      makes the phrase the most concrete opening text anywhere in the prompt.
//      Output moved from "Səhər tezdən" straight to "Səhər saatlarında" — the
//      SECOND entry on the list. Say what the opening MUST be, never what it
//      must not be.
//   2. An ESCAPE HATCH ("if this frame doesn't suit the topic, pick another
//      everyday driving situation"). It was meant to protect quality on topics
//      where a road scene is awkward, but a model offered an opt-out takes it
//      on essentially every call and falls back to its own habitual opener —
//      which is exactly the uniformity this whole mechanism exists to prevent.
//      The frame is now unconditional, and it is the FIRST line of the user
//      prompt rather than a clause buried before the source text.
//
// The frame is picked deterministically from the topic title (see pickSceneFrame),
// not at random: regenerating a topic must reproduce the same lesson, otherwise an
// admin who retries a draft gets an unrelated scene and can't tell a retry from a
// rewrite. Different titles hash to different slots, which is what spreads the
// openings across a course.
//
// Every frame is a generic driving CONDITION — road type, weather, light, traffic.
// None of them asserts a rule, a number, a place or an event, so an assigned frame
// can never become an invented fact; it only decides where the reader is standing
// while the source text's own rules are explained. That is the same DECORATION-not-
// facts line the system prompt draws.
const SCENE_FRAMES = [
  'sıx şəhər trafikində, işıqforlu kəsişməyə yaxınlaşarkən',
  'yağışlı havada şəhərkənarı yolda, görünüş zəif olarkən',
  'gecə vaxtı işıqlandırılmamış yolda',
  'dar küçədə, hər iki tərəfdə park edilmiş avtomobillərin arasından keçərkən',
  'çoxzolaqlı geniş yolda, zolaq dəyişməyə hazırlaşarkən',
  'dairəvi hərəkətə daxil olarkən',
  'piyada keçidinin qarşısında, piyadalar yolun kənarında dayanarkən',
  'buzlu, sürüşkən yolda, təkərlərin yolu zəif tutduğu şəraitdə',
  'tıxacda, addım-addım irəliləyərkən',
  'kənd yolunda, qarşındakı ağır texnikanın arxasında',
  'tuneldən keçərkən',
  'dəmiryol keçidinə yaxınlaşarkən',
  'yol işləri gedən hissədə, zolaq daralarkən',
  'uzun enişli dağ yolunda',
  'park yerindən geri sürərək çıxarkən',
  'körpüdən keçərkən, yan küləyin hiss olunduğu yerdə',
] as const;

// djb2. Any stable string hash does; this one is short and has no dependencies.
// Only used to spread titles across SCENE_FRAMES, so distribution quality matters
// and cryptographic strength does not.
function hashTitle(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pickSceneFrame(topicTitle: string): string {
  return SCENE_FRAMES[hashTitle(topicTitle) % SCENE_FRAMES.length];
}

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

// Reading material is prose, not structured extraction, so it never uses the
// small/cheap rewrite model. It does NOT follow LLM_PROVIDER either: it runs on
// its own Gemini-first chain (getLessonContentModelChain), because Azerbaijani
// long-form prose is where the current chat provider is weakest — see that
// function's comment in lib/llm/index.ts for the full reasoning. The question
// pool below is unaffected; that IS structured extraction and stays on the
// rewrite chain.
export async function generateTopicReadingContent(
  topicTitle: string,
  chunks: TopicSourceChunk[]
): Promise<TopicReadingOutcome> {
  const sourceText = buildSourceText(chunks);
  if (!sourceText.trim()) {
    return { ok: false, error: 'Mövzunun mənbə mətni boşdur' };
  }

  try {
    const { object } = await generateObjectWithRouting(getLessonContentModelChain(), readingContentSchema, {
      system: READING_SYSTEM_PROMPT,
      providerOptions: getProviderCallOptions(),
      prompt: `SƏHNƏ ÇƏRÇİVƏSİ — bu dərsin açılış cümləsi məhz bu şəraiti təsvir etməlidir: ${pickSceneFrame(topicTitle)}\n\nMövzunun təxmini adı: ${topicTitle}\n\nSənədin bu mövzuya aid hissəsi:\n"""\n${sourceText}\n"""`,
    });

    if (!object.content.trim()) {
      return {
        ok: false,
        error: 'Model bu mətndən dərs materialı çıxara bilmədi (boş nəticə qaytardı)',
      };
    }

    return { ok: true, content: object };
  } catch (error) {
    void logError('lessons.generateTopicContent.reading', error);
    console.error('[lessons/generateTopicContent] reading content generation failed:', error);
    return {
      ok: false,
      error: `Dərs materialı yaradılmadı — ${describeLlmError(getLessonContentModelId(), error)}`,
    };
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
    const { object } = await generateObjectWithRouting(getRewriteModelChain(), generatedQuestionsSchema, {
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
    void logError('lessons.generateTopicContent.questions', error);
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
    void logError('lessons.generateTopicContent.loadChunks', error);
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
