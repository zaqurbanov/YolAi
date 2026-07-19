import 'server-only';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getRewriteModel } from '@/lib/llm';
import { parsePdf } from '@/lib/ingestion/parsePdf';
import { RULE_CATEGORIES } from '@/lib/content/ruleCategories';

const CATEGORY_TITLES = RULE_CATEGORIES.map((c) => c.title) as [string, ...string[]];

export const generatedQuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()).length(4),
  correctIndex: z.number().min(0).max(3),
  category: z.enum(CATEGORY_TITLES),
  explanation: z.string().optional(),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;

const generatedQuestionsSchema = z.object({
  questions: z.array(generatedQuestionSchema),
});

// Same hallucination-avoidance stance as lib/rag/buildPrompt.ts's system
// prompt: only generate what's directly, literally supported by the
// provided text, and skip anything uncertain rather than invent a plausible-
// sounding fact/article number — a wrong quiz answer is exactly the kind of
// error this app exists to prevent.
const SYSTEM_PROMPT = `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə test sualları hazırlayan köməkçisən. Sənə bir sənədin mətni veriləcək. Vəzifən bu mətndən YALNIZ mətndə HƏRFİ VƏ AYDIN ŞƏKİLDƏ dəstəklənən faktlara əsaslanan çoxseçimli test sualları hazırlamaqdır.

Qaydalar:
- Hər sual dəqiq 4 cavab variantından ibarət olmalıdır, yalnız biri düzgündür.
- Sualı və bütün variantları Azərbaycan dilində yaz.
- Yalnız verilən mətndə birbaşa dəstəklənən faktlara, rəqəmlərə, maddə nömrələrinə və qaydalara əsaslan. Heç vaxt mətndə olmayan fakt, rəqəm və ya qayda uydurma — hətta ümumi biliyinlə doğru olduğunu düşünsən belə.
- Əgər mətn hansısa mövzuda dəqiq/etibarlı sual yaratmaq üçün kifayət qədər aydın deyilsə, o mövzunu SADƏCƏ BURAX — az sayda etibarlı sual yaratmaq, çox sayda şübhəli sual yaratmaqdan daha yaxşıdır.
- Yanlış cavab variantları da mövzu ilə əlaqəli və məntiqli olmalıdır (aşkar səhv və ya əlaqəsiz variantlar yazma), amma mətnə əsasən aydın şəkildə səhv olmalıdırlar.
- Hər sual üçün ən uyğun kateqoriyanı seç (yalnız verilən kateqoriya siyahısından).
- İstəyə görə qısa bir izah (explanation) əlavə edə bilərsən — bu da yalnız mətndəki məlumata əsaslanmalıdır.
- Mətndə heç bir etibarlı sual mövzusu yoxdursa, boş bir siyahı qaytar.`;

const MAX_SOURCE_CHARS = 60000;

export async function generateQuestionsFromPdf(buffer: ArrayBuffer): Promise<GeneratedQuestion[]> {
  const pages = await parsePdf(buffer);
  const fullText = pages.map((p) => p.text).join('\n\n');

  // Bounds worst-case prompt size for very large PDFs — same rationale as
  // rewriteQuery's maxOutputTokens cap, just on the input side. A large
  // uploaded traffic-law PDF's early pages carry the bulk of rule content;
  // truncating rather than chunking-and-batching here keeps this function
  // simple, matching the brief's "pure/testable, single call" shape.
  const sourceText =
    fullText.length > MAX_SOURCE_CHARS ? fullText.slice(0, MAX_SOURCE_CHARS) : fullText;

  const categoryList = CATEGORY_TITLES.map((title) => `- ${title}`).join('\n');

  const { object } = await generateObject({
    model: getRewriteModel(),
    schema: generatedQuestionsSchema,
    system: SYSTEM_PROMPT,
    prompt: `Kateqoriya siyahısı (hər sual üçün bunlardan birini seç):\n${categoryList}\n\nSənəd mətni:\n"""\n${sourceText}\n"""`,
  });

  return object.questions;
}
