import 'server-only';
import { generateText, convertToModelMessages, type UIMessage, type FileUIPart } from 'ai';
import { getVisionModel } from '@/lib/llm';

// Deliberately narrow: this is step 1 of the two-step hybrid flow (see
// app/api/chat/route.ts) — its ONLY job is to name what's visually in the
// photo, in a few Azerbaijani words, so that string can be fed into the
// existing text-based retrieval pipeline exactly like a typed question.
// It must NOT cite article numbers, explain the rule, or invent anything —
// grounding/citations still flow entirely through the normal RAG pipeline
// downstream of this call, on whatever this function returns.
const IDENTIFY_SYSTEM_PROMPT = `Sən Azərbaycan yol nişanlarını tanıyan köməkçisən.
Sənə göndərilən şəkildə görünən yol nişanını və ya yol vəziyyətini QISA şəkildə,
Azərbaycan dilində müəyyən et.

Qaydalar:
- Yalnız şəkildə GÖRDÜYÜNÜ tanı, bir neçə söz və ya bir qısa cümlə ilə (məsələn:
  "Dayanmaq qadağandır nişanı" və ya "Sürət həddini məhdudlaşdıran nişan, 50 km/saat").
- Maddə nömrəsi göstərmə, hüquqi izahat vermə, qayda haqqında heç nə uydurma.
- Əgər şəkildə heç bir yol nişanı və ya yol hərəkəti ilə bağlı element yoxdursa,
  sadəcə "Yol nişanı aşkar edilmədi" cavabını ver.
- Cavabın YALNIZ tanımlama ifadəsi olsun, başqa heç nə əlavə etmə.`;

// imagePart is passed through convertToModelMessages (the same conversion the
// main chat route already relies on for multimodal UIMessage parts) rather
// than hand-rolling data-URL/base64 parsing here, so this stays consistent
// with however that helper resolves FileUIPart -> ModelMessage image content.
export async function identifySignFromImage(imagePart: FileUIPart): Promise<string> {
  const model = getVisionModel();
  if (!model) {
    throw new Error('identifySignFromImage called while no vision model is configured');
  }

  const syntheticMessage: UIMessage = {
    id: 'vision-identify',
    role: 'user',
    parts: [
      { type: 'text', text: 'Bu şəkildəki yol nişanını və ya yol vəziyyətini tanı.' },
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
