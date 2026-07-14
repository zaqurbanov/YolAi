import 'server-only';
import { getRewriteModel, getRewriteModelFallback, getProviderCallOptions } from '@/lib/llm';
import { generateTextWithFallback } from '@/lib/llm/fallback';
import type { RetrievedChunk } from '@/lib/retrieval/search';

export interface RerankResult {
  keptIds: string[] | null; // null = rerank unavailable/failed, caller falls back
  rerankMs: number;
}

// Was 80 — too low once route.ts started merging a primary corpus-wide
// search with a supplementary per-document-guaranteed search (see
// retrievePerDocumentChunks() in lib/retrieval/search.ts): the merged pool
// can run past 200 candidates, and a target chunk landing past index 80 in
// that merged array was being silently truncated away here before the LLM
// ever saw it — confirmed live against real bug repros (chunk present in the
// merged pool at index ~127-146, absent from the final kept set). Raised to
// comfortably cover realistic merged-pool sizes; callers should also sort
// candidates by combined_score before calling rerankChunks so a still-larger
// pool degrades by dropping the *weakest* candidates, not an arbitrary suffix
// — this is only a meaningful ordering because every merged source computes
// combined_score with the same vector+trigram fusion formula.
const MAX_RERANK_CANDIDATES = 220;
const PREVIEW_LENGTH = 220;

const RERANK_PROMPT = `Sən Azərbaycanın Yol Hərəkəti Qaydaları üzrə axtarış nəticələrini süzgəcdən keçirən köməkçi funksiyasın. Sənə istifadəçinin sualı və nömrələnmiş sənəd parçalarının (excerpt) siyahısı veriləcək. Vəzifən sualı cavablandırmaqda HƏQİQƏTƏN kömək edə biləcək parçaların nömrələrini seçməkdir.

Qaydalar:
- Sualı ÖZÜN CAVABLANDIRMA — yalnız hansı parçaların faydalı ola biləcəyini seç.
- Bu addım son cavab deyil, sonrakı mərhələ üçün namizədləri süzgəcdən keçirir — ona görə şübhəli/qismən əlaqəli parçaları da daxil etməyə meylli ol, onları xaric etməkdənsə.
- Yalnız çılpaq JSON massivi (1-əsaslı tam ədədlərdən ibarət) qaytar, başqa heç nə yazma — izahat, markdown, sitat işarəsi olmadan. Məsələn: [2, 5, 11, 12]
- Əgər heç bir parça əlaqəli deyilsə belə, ən azı mövzuca ən yaxın olanları qaytar.`;

function buildPreview(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= PREVIEW_LENGTH) return trimmed;

  const cut = trimmed.slice(0, PREVIEW_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  const boundary = lastSpace > 0 ? cut.slice(0, lastSpace) : cut;
  return `${boundary}…`;
}

function buildCandidateList(candidates: RetrievedChunk[]): string {
  return candidates
    .map((chunk, i) => {
      const label = chunk.article_label ?? 'naməlum';
      return `[${i + 1}] Sənəd: ${chunk.document_title} · ${label}: ${buildPreview(chunk.content)}`;
    })
    .join('\n');
}

function parseKeptIndices(text: string, candidateCount: number): number[] | null {
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  const parsed = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(parsed)) return null;

  const seen = new Set<number>();
  const valid: number[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'number' || !Number.isInteger(entry)) continue;
    if (entry < 1 || entry > candidateCount) continue;
    if (seen.has(entry)) continue;
    seen.add(entry);
    valid.push(entry);
  }

  return valid.length > 0 ? valid : null;
}

export async function rerankChunks(
  query: string,
  candidates: RetrievedChunk[],
  keepCount = 15,
): Promise<RerankResult> {
  const start = performance.now();
  try {
    const capped = candidates.slice(0, MAX_RERANK_CANDIDATES);

    const { text } = await generateTextWithFallback(getRewriteModel(), getRewriteModelFallback(), {
      system: RERANK_PROMPT,
      prompt: `İstifadəçinin sualı: "${query}"\n\nSənəd parçaları:\n${buildCandidateList(capped)}`,
      providerOptions: getProviderCallOptions(),
      temperature: 0,
    });
    const rerankMs = performance.now() - start;

    const validIndices = parseKeptIndices(text, capped.length);
    if (!validIndices) return { keptIds: null, rerankMs };

    const keptIndices = validIndices.length > keepCount ? validIndices.slice(0, keepCount) : validIndices;
    const keptIds = keptIndices.map((i) => capped[i - 1].id);

    return { keptIds, rerankMs };
  } catch (err) {
    console.error('[rerankChunks] failed to rerank candidates, falling back to unranked order:', err);
    return { keptIds: null, rerankMs: performance.now() - start };
  }
}
