import 'server-only';
import { generateText, convertToModelMessages, type UIMessage, type FileUIPart } from 'ai';
import { getVisionModel } from '@/lib/llm';

// This is step 1 of the two-step hybrid flow (see app/api/chat/route.ts) — its
// job is to produce a SHORT, factual Azerbaijani description of what is visibly
// in the photo and relevant to traffic rules (both any road sign AND the road
// situation), so that string can be fed into the existing text-based retrieval
// pipeline exactly like a typed question AND injected as the observed scene for
// the answering model. It must NOT cite article numbers, explain the rule, or
// judge whether it's a violation — grounding/citations and the conditional
// violation assessment still flow entirely through the normal RAG pipeline
// downstream of this call, on whatever this function returns.
const IDENTIFY_SYSTEM_PROMPT = `Sən Azərbaycan yol hərəkəti şəkillərini təsvir edən köməkçisən.
Sənə göndərilən şəkildə yol hərəkəti ilə bağlı GÖRÜNƏN vəziyyəti QISA və
FAKTİKİ şəkildə, Azərbaycan dilində təsvir et.

Qaydalar:
- Yalnız şəkildə GÖRÜNƏNİ təsvir et — bir və ya iki cümlə ilə, qısa. Həm varsa
  yol nişanını, həm də yol vəziyyətini əhatə et: nəqliyyat vasitəsinin
  nişanlanmaya/zolaqlara/dayanma xəttinə görə mövqeyi, hərəkət istiqaməti,
  dayanma və ya park etmə, görünürsə svetoforun rəngi, piyada və ya piyada
  keçidi və s. (məsələn: "Avtomobil piyada keçidinin üstündə dayanıb" və ya
  "Qırmızı işıqda avtomobil dayanma xəttini keçib").
- STATİK vəziyyətlə yanaşı DİNAMİK manevrləri də diqqətlə qeyd et: bir nəqliyyat
  vasitəsinin qarşı (əks istiqamətli) zolağa çıxması, ötmə (qabaqlama), əks
  istiqamətdə hərəkət, kəsilməz (bütöv) xətti keçmə, dönmə və s.
- Nəqliyyat vasitələrinin HƏRƏKƏTDƏ, yoxsa DAYANMIŞ/PARK EDİLMİŞ olduğunu bacardığın
  qədər ayırd et və bunu açıq yaz. Əgər şəkildən bunu dəqiq müəyyən edə bilmirsənsə,
  "maşınların hərəkətdə, yoxsa dayanmış olduğu şəkildən dəqiq bilinmir" kimi bildir —
  HEÇ VAXT avtomatik "dayanıb/park edib" fərz etmə. Sıx hərəkət axını, açıq zolaqlar
  və maşınların yol boyu düzülüşü çox vaxt PARK deyil, HƏRƏKƏT deməkdir.
- Şəkildəki nəqliyyat vasitələrinin ƏKSƏRİYYƏTİ eyni cür dursa/hərəkət etsə,
  lakin BİR (və ya bir neçə) vasitə fərqli davranırsa (məsələn, hamı sol zolaqda
  hərəkət edir, amma bir avtomobil sağa/qarşı zolağa çıxır), həmin FƏRQLİ vasitəni
  və onun HƏRƏKƏT İSTİQAMƏTİNİ ayrıca, konkret təsvir et — yalnız ümumi mənzərəni
  yazıb fərqli olanı qaçırma.
- Yalnız şəkildə açıq-aydın GÖRDÜYÜNÜ yaz; görünməyən heç nəyi ehtimal etmə və
  uydurma.
- Maddə nömrəsi göstərmə, hüquqi izahat vermə, bunun pozuntu olub-olmadığı barədə
  heç bir hökm vermə — sadəcə səhnəni təsvir et.
- Əgər şəkildə yol hərəkəti ilə bağlı heç bir element yoxdursa, sadəcə
  "Yol hərəkəti ilə bağlı element aşkar edilmədi" cavabını ver.
- Cavabın YALNIZ bu qısa təsvir olsun, başqa heç nə əlavə etmə.`;

// The user's own caption is the strongest hint about what in the photo matters
// — the earlier version threw it away and let the vision model default to the
// dominant visual (e.g. a row of parked cars), missing the single vehicle the
// user was actually asking about. When present, it STEERS attention only; the
// prompt still requires the model to describe what it genuinely sees, so a
// caption can't make it hallucinate a maneuver that isn't visible.
function buildSyntheticText(userCaption?: string): string {
  const base = 'Bu şəkildə yol hərəkəti ilə bağlı görünən vəziyyəti qısa təsvir et.';
  const caption = userCaption?.trim();
  if (!caption) return base;
  return `İstifadəçinin sualı/qeydi: "${caption}".
${base} Xüsusilə istifadəçinin işarə etdiyi məqama diqqət et, amma YALNIZ şəkildə həqiqətən gördüyünü yaz — istifadəçinin dediyini şəkildə görmürsənsə, gördüyünü olduğu kimi bildir.`;
}

// imagePart is passed through convertToModelMessages (the same conversion the
// main chat route already relies on for multimodal UIMessage parts) rather
// than hand-rolling data-URL/base64 parsing here, so this stays consistent
// with however that helper resolves FileUIPart -> ModelMessage image content.
export async function identifySignFromImage(
  imagePart: FileUIPart,
  userCaption?: string,
): Promise<string> {
  const model = getVisionModel();
  if (!model) {
    throw new Error('identifySignFromImage called while no vision model is configured');
  }

  const syntheticMessage: UIMessage = {
    id: 'vision-identify',
    role: 'user',
    parts: [
      { type: 'text', text: buildSyntheticText(userCaption) },
      imagePart,
    ],
  };

  const [modelMessage] = await convertToModelMessages([syntheticMessage]);

  const { text } = await generateText({
    model,
    system: IDENTIFY_SYSTEM_PROMPT,
    // Gemini 2.5 models think by default — a live call with this prompt spent
    // 659 hidden thought tokens to name the contents of a trivial image. This
    // call sits on the critical path BEFORE rewrite/retrieval/answer inside a
    // 60s maxDuration, and naming what is in a photo in a few words needs no
    // chain of thought. Same reasoning as DISABLE_REASONING in lib/llm.
    // A providerOptions key that doesn't match the active provider is ignored,
    // so the anthropic vision branch is unaffected.
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    messages: [modelMessage],
  });

  return text.trim();
}
