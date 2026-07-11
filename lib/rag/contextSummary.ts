import 'server-only';
import { getChatModel, getChatModelFallback } from '@/lib/llm';
import { generateTextWithFallback } from '@/lib/llm/fallback';

export interface ConversationContextSummary {
  topics: string[];
  facts: string[];
  preferences: string[];
  updated_at: string;
  message_count_at_summary: number;
}

export function isEmptySummary(summary: unknown): boolean {
  return (
    !summary ||
    typeof summary !== 'object' ||
    Object.keys(summary as Record<string, unknown>).length === 0
  );
}

export function shouldUpdateSummary(totalMessageCount: number, lastSummaryMessageCount: number): boolean {
  return totalMessageCount - lastSummaryMessageCount >= 2;
}

const SUMMARY_PROMPT = `Sən söhbət tarixçəsini yığcam JSON şəklində yadda saxlayan köməkçi funksiyasın. Bu, hüquqi cavab vermək üçün deyil — sadəcə söhbətin əvvəlki hissəsini xatırlamaq üçündür.

Sənə əvvəlki xülasə (JSON) və söhbətin ən son mesajları veriləcək. Vəzifən: əvvəlki xülasəni yeni mesajlarla yeniləyib, aşağıdaki formatda YALNIZ JSON qaytarmaqdır (heç bir izahat, heç bir markdown kod bloku olmadan):

{
  "topics": string[],       // müzakirə olunan mövzular (qısa)
  "facts": string[],        // söhbətdə deyilən konkret fakt/detallar (istifadəçinin vəziyyəti, sual etdiyi maddələr və s.)
  "preferences": string[],  // istifadəçinin bildirdiyi seçim/istəklər (əgər varsa)
  "updated_at": string,     // ISO 8601 tarix
  "message_count_at_summary": number
}

Qaydalar:
- Yalnız verilən mesajlardakı məlumata əsaslan, heç nə uydurma.
- Siyahıları qısa və yığcam saxla (hər biri üçün maksimum 8 element), köhnə və artıq lazımsız olan elementləri sil.
- Cavabın YALNIZ etibarlı JSON olmalıdır.`;

export async function updateContextSummary(
  previousSummary: object,
  newMessages: { role: string; content: string }[],
  messageCountAtSummary: number,
): Promise<ConversationContextSummary> {
  const fallback: ConversationContextSummary = {
    topics: Array.isArray((previousSummary as Partial<ConversationContextSummary>)?.topics)
      ? (previousSummary as ConversationContextSummary).topics
      : [],
    facts: Array.isArray((previousSummary as Partial<ConversationContextSummary>)?.facts)
      ? (previousSummary as ConversationContextSummary).facts
      : [],
    preferences: Array.isArray((previousSummary as Partial<ConversationContextSummary>)?.preferences)
      ? (previousSummary as ConversationContextSummary).preferences
      : [],
    updated_at: new Date().toISOString(),
    message_count_at_summary: messageCountAtSummary,
  };

  try {
    const conversationText = newMessages
      .map((m) => `${m.role === 'user' ? 'İstifadəçi' : 'Köməkçi'}: ${m.content}`)
      .join('\n');

    const { text } = await generateTextWithFallback(getChatModel(), getChatModelFallback(), {
      system: SUMMARY_PROMPT,
      prompt: `Əvvəlki xülasə:\n${JSON.stringify(previousSummary)}\n\nYeni mesajlar:\n${conversationText}`,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallback;

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics.slice(0, 8) : fallback.topics,
      facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 8) : fallback.facts,
      preferences: Array.isArray(parsed.preferences) ? parsed.preferences.slice(0, 8) : fallback.preferences,
      updated_at: new Date().toISOString(),
      message_count_at_summary: messageCountAtSummary,
    };
  } catch (err) {
    console.error('[contextSummary] failed to update summary:', err);
    return fallback;
  }
}
