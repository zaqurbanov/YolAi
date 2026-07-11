import 'server-only';
import { getRewriteModel, getRewriteModelFallback } from '@/lib/llm';
import { generateTextWithFallback } from '@/lib/llm/fallback';

const MAX_REWRITTEN_LENGTH = 400;

const REWRITE_PROMPT = `Sən Azərbaycanın Yol Hərəkəti Qaydaları üzrə axtarış sorğusunu genişləndirən köməkçi funksiyasın. Sənə istifadəçinin qısa/qeyri-müəyyən sualı veriləcək. Vəzifən onu sənəd axtarışı (retrieval) üçün daha uyğun, açar sözlərlə və sinonimlərlə zənginləşdirilmiş formaya çevirməkdir.

Qaydalar:
- Sualı ÖZÜN CAVABLANDIRMA — yalnız axtarış üçün sorğunu yenidən yaz.
- Sorğuda ehtiva olunmayan yeni faktlar uydurma.
- Mövzu ilə bağlı əlaqəli terminləri, tərif axtaran ifadələri əlavə edə bilərsən (məsələn "velosiped yolu" -> "velosiped yolu tərifi qaydaları velosipedçilər üçün ayrılmış yol zolağı").
- Yalnız yenidən yazılmış sorğu mətnini qaytar — heç bir izahat, sitat işarəsi və ya markdown olmadan.
- Cavabın qısa və yığcam olsun (bir neçə cümlə/söz birləşməsi), lazımsız uzatma.`;

function isUsableRewrite(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_REWRITTEN_LENGTH) return false;
  return true;
}

export async function rewriteQuery(query: string, contextSummary?: object): Promise<string> {
  try {
    let contextBlock = '';
    if (contextSummary && Object.keys(contextSummary).length > 0) {
      const { topics, facts } = contextSummary as { topics?: string[]; facts?: string[] };
      const parts: string[] = [];
      if (Array.isArray(topics) && topics.length > 0) parts.push(`Mövzular: ${topics.join(', ')}`);
      if (Array.isArray(facts) && facts.length > 0) parts.push(`Faktlar: ${facts.join(', ')}`);
      if (parts.length > 0) {
        contextBlock = `\n\nSöhbətin əvvəlki konteksti (əvəzliklərin nəyə istinad etdiyini anlamaq üçün istifadə et, amma sorğuya yeni fakt əlavə etmə):\n${parts.join('\n')}`;
      }
    }

    // Reasoning is disabled centrally in getRewriteModel() (lib/llm/index.ts) —
    // re-verified 2026-07-11: a prior comment here claimed disabling reasoning
    // degraded output quality, but that was never re-tested against the
    // currently configured rewrite model and turned out to be the dominant
    // source of a 13.8s user-facing latency spike (chat_request_timing logs).
    const { text } = await generateTextWithFallback(getRewriteModel(), getRewriteModelFallback(), {
      system: REWRITE_PROMPT,
      prompt: `İstifadəçinin sualı: "${query}"${contextBlock}`,
    });

    if (!isUsableRewrite(text)) return query;
    return text.trim();
  } catch (err) {
    console.error('[rewriteQuery] failed to rewrite query, falling back to raw query:', err);
    return query;
  }
}
