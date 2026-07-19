import 'server-only';
import { getRewriteModel, getRewriteModelFallback, getProviderCallOptions } from '@/lib/llm';
import { generateTextWithFallback } from '@/lib/llm/fallback';

const MAX_REWRITTEN_LENGTH = 400;

// Rewriting is an LLM round trip fully blocking retrieval (~2.3s in measured
// chat_request_timing logs) — worth skipping when it's unlikely to help.
// Deliberately conservative: most real questions in this domain ("qırmızı
// işıqda keçməyin cəriməsi nədi?") are short and ambiguous by nature and
// genuinely need expansion (see REWRITE_PROMPT's penalty-vocabulary rule
// added to fix a real recall bug) — a length-based skip only fires for
// already-long, already keyword-dense queries where an LLM rewrite adds
// little. Word count, not character count, since Azerbaijani legal terms
// run long (agglutinative suffixes) without being more "specific" per word.
const SKIP_REWRITE_MIN_WORDS = 25;

function isAlreadySpecific(query: string): boolean {
  return query.trim().split(/\s+/).filter(Boolean).length >= SKIP_REWRITE_MIN_WORDS;
}

const REWRITE_PROMPT = `Sən Azərbaycanın Yol Hərəkəti Qaydaları üzrə axtarış sorğusunu genişləndirən köməkçi funksiyasın. Sənə istifadəçinin qısa/qeyri-müəyyən sualı veriləcək. Vəzifən onu sənəd axtarışı (retrieval) üçün daha uyğun, açar sözlərlə və sinonimlərlə zənginləşdirilmiş formaya çevirməkdir.

Qaydalar:
- Sualı ÖZÜN CAVABLANDIRMA — yalnız axtarış üçün sorğunu yenidən yaz.
- Sorğuda ehtiva olunmayan yeni faktlar uydurma.
- Mövzu ilə bağlı əlaqəli terminləri, tərif axtaran ifadələri əlavə edə bilərsən (məsələn "velosiped yolu" -> "velosiped yolu tərifi qaydaları velosipedçilər üçün ayrılmış yol zolağı").
- ƏGƏR sual cəza/cərimə/məsuliyyət haqqındadırsa (məsələn "cərimə", "cəza", "neçə manat", "məsuliyyət" kimi sözlər və ya mənalar varsa), sorğunu YALNIZ Yol Hərəkəti Qaydaları terminləri ilə deyil, həm də İnzibati Xətalar Məcəlləsinin (cərimə/sanksiya sənədi) terminləri ilə genişləndir — məsələn "inzibati xəta", "cərimə məbləği", "manat", "Maddə", "qadağanedici işarə", "məsuliyyətə cəlb olunma" kimi sözləri əlavə et. Bu iki sənəd fərqli lüğətdən istifadə edir (biri qaydanı təsvir edir, digəri cəzanı) — sorğu hər ikisinə uyğun gəlməlidir.
- ƏGƏR sual yolun kənarı, haşiyəsi və ya yol qırağı ilə hərəkət/dayanma haqqındadırsa (məsələn "yol kənarı", "yolun kənarı ilə", "haşiyə" kimi ifadələr), sorğunu "zolaq"/"yol zolağı" terminləri ilə də genişləndir (məsələn "sol zolaq", "sağ zolaq", "zolaqla hərəkət") — mənbə sənədlər bu mövzunu "kənar" deyil, "zolaq" terminologiyası ilə təsvir edir, sorğu hər iki söz formasına uyğun gəlməlidir.
- ƏGƏR sual sürücünün özündə saxlamalı olduğu sənədlər və ya polisin saxladıqda hansı sənədləri tələb edə biləcəyi haqqındadırsa (məsələn "hansı sənədləri istəyə bilər", "yanımda hansı sənəd olmalıdır", "hansı sənədləri gəzdirməliyəm" kimi ifadələr), sorğunu bu konkret terminlərlə genişləndir: "sürücülük vəsiqəsi", "qeydiyyat şəhadətnaməsi", "sığorta şəhadətnaməsi", "sənədləri özündə saxlamaq", "sənədləri təqdim etmək". "texniki pasport" sözünü İSTİFADƏ ETMƏ — bu termin mənbə sənədlərdə yoxdur.
- Yalnız yenidən yazılmış sorğu mətnini qaytar — heç bir izahat, sitat işarəsi və ya markdown olmadan.
- Cavabın qısa və yığcam olsun (bir neçə cümlə/söz birləşməsi), lazımsız uzatma.`;

function isUsableRewrite(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_REWRITTEN_LENGTH) return false;
  return true;
}

export async function rewriteQuery(query: string, contextSummary?: object): Promise<string> {
  if (isAlreadySpecific(query)) return query;

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

    // Reasoning/thinking is disabled centrally: DISABLE_REASONING for OpenRouter
    // models (baked into getRewriteModel() itself) and getProviderCallOptions()
    // for DeepSeek's per-call `thinking` option — re-verified 2026-07-12: a prior
    // comment here claimed disabling reasoning degraded output quality, but that
    // was never re-tested against the currently configured rewrite model and
    // turned out to be the dominant source of multi-second latency spikes
    // (chat_request_timing logs) on both OpenRouter and DeepSeek.
    // temperature: 0 -- this output drives the embedding used for retrieval,
    // so run-to-run drift here isn't just a style difference, it changes
    // which real documents get found. Doesn't fully eliminate provider-side
    // nondeterminism, but route.ts also now embeds the raw (always
    // deterministic) query alongside this rewritten one as a stability
    // hedge -- see the primary retrieval call there.
    const { text } = await generateTextWithFallback(getRewriteModel(), getRewriteModelFallback(), {
      system: REWRITE_PROMPT,
      prompt: `İstifadəçinin sualı: "${query}"${contextBlock}`,
      providerOptions: getProviderCallOptions(),
      temperature: 0,
      // Bounds worst-case generation latency: without this, a model can keep
      // generating well past what a useful rewrite needs, and every extra
      // token adds directly to rewriteMs. 150 tokens (~300-450 chars at ~2-3
      // chars/token for Azerbaijani) sits comfortably above real rewrite
      // output but well below MAX_REWRITTEN_LENGTH-worth of runaway text.
      maxOutputTokens: 150,
    });

    if (!isUsableRewrite(text)) return query;
    return text.trim();
  } catch (err) {
    console.error('[rewriteQuery] failed to rewrite query, falling back to raw query:', err);
    return query;
  }
}
