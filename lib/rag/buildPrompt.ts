import type { RetrievedChunk } from '@/lib/retrieval/search';

export function buildSystemPrompt(userName?: string | null): string {
  const addressingInstruction = userName
    ? `- İstifadəçinin adı "${userName}"-dır. Münasib yerlərdə onu bu adla təbii şəkildə xitab edə bilərsən, amma hər cümlədə təkrar etmə. Ümumi "dostum" və ya bənzər tanış ləqəblərdən istifadə etmə.`
    : `- İstifadəçinin adı məlum deyil. Onu "dostum" və ya bənzər tanış, ümumi bir ləqəblə çağırma — sadəcə birbaşa, hörmətli tərzdə müraciət et.`;

  return `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə ixtisaslaşmış, mehriban və insani tərzdə danışan köməkçisən. Quru, robotik cavablar vermə — sadə, təbii və isti bir dildə, mövzunu yaxşı bilən bir mütəxəssis kimi izah et.

Qaydalar:
- Yalnız aşağıda verilən KONTEKST bölməsindəki məlumata əsaslanaraq cavab ver. Heç vaxt maddə nömrəsi və ya fakt uydurma.
- Sən yalnız KONTEKST bölməsində HƏRFİ GÖRÜNƏN maddə nömrələrini, cərimə məbləğlərini və rəqəmləri istifadə edə bilərsən. Kontekstdə hərfi göstərilməyən heç bir maddə nömrəsi, cərimə məbləği və ya hüquqi fakt yazma — hətta ümumi biliyinlə doğru olduğunu düşünsən belə. Əmin olmadığın və ya kontekstdə tapa bilmədiyin rəqəmi/maddəni təxmin etmə.
- Əgər sualın cavabı kontekstdə yoxdursa, bunu düz, lakin nəzakətli və insani şəkildə bildir — məsələn, üzr istəyib bu mövzuda əlində olan sənədlərdə birbaşa cavab tapa bilmədiyini söylə, mümkünsə sualı dəqiqləşdirməyi təklif et və ya ən yaxın əlaqəli mövzunu qısaca xatırlat. "Bu məlumat verilən sənədlərdə tapılmadı." kimi sabit, robotik ifadəni təkrar-təkrar istifadə etmə; hər dəfə təbii şəkildə fərqli cür ifadə et.
- Cavabında istifadə etdiyin hər bir faktdan sonra kvadrat mötərizədə istinad göstər, məsələn: [Sənəd: {başlıq}, Maddə {nömrə}, səhifə {səhifə}].
- KONTEKST bölməsində bir-birinə mövzu baxımından yaxın, amma fərqli sualları cavablandıran bir neçə parça ola bilər (məsələn biri sürücünün ümumi vəzifələrindən, digəri konkret bir prosedurdan bəhs edə bilər). Bu halda sualı ƏN BİRBAŞA və HƏRFİ cavablandıran parçanı seç və ona istinad et — yalnız mövzu baxımından ümumi oxşarlığa görə deyil, sualın konkret nə soruşduğuna əsaslanaraq qərar ver.
- Aydın, qısa, səmimi və Azərbaycan dilində cavab ver.
${addressingInstruction}`;
}

export function buildContextBlock(chunks: RetrievedChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const label = chunk.article_label ? `Maddə: ${chunk.article_label}` : 'Maddə: naməlum';
      const page = chunk.page_number ? `səhifə ${chunk.page_number}` : 'səhifə naməlum';
      return `[${i + 1}] Sənəd: ${chunk.document_title} · ${label} · ${page}\n${chunk.content}`;
    })
    .join('\n\n---\n\n');
}

export function buildCitations(chunks: RetrievedChunk[]) {
  return chunks.map((chunk) => ({
    document_id: chunk.document_id,
    title: chunk.document_title,
    page: chunk.page_number,
    article_label: chunk.article_label,
  }));
}

// Retrieval returns up to 15 chunks as candidate context, but the model only
// ends up grounding its answer in a handful of them — showing all 15 as
// "citations" is misleading (most were never actually used). The system
// prompt (buildSystemPrompt) instructs the model to cite as
// "[Sənəd: {document_title}, Maddə {N}, səhifə {page}]", using the exact
// document_title string it was given in the context block — so requiring
// that literal title (plus the article number, when the chunk has one) to
// appear in the answer text is a reliable way to tell which chunks were
// actually referenced, without trusting the model to report citation
// *content* (title/article/page) itself — we still only ever display data
// that came from the real retrieval result, just gated on whether it was used.
export function filterCitedChunks(chunks: RetrievedChunk[], answerText: string): RetrievedChunk[] {
  return chunks.filter((chunk) => {
    if (!chunk.document_title || !answerText.includes(chunk.document_title)) return false;

    const articleMatch = chunk.article_label?.match(/Maddə\s+(\d+)/i);
    if (!articleMatch) return true;

    const articleNumberPattern = new RegExp(`Madd[əe]\\s+${articleMatch[1]}\\b`, 'i');
    return articleNumberPattern.test(answerText);
  });
}
