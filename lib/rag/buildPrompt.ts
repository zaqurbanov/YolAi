import type { RetrievedChunk } from '@/lib/retrieval/search';

export function buildSystemPrompt(userName?: string | null): string {
  const addressingInstruction = userName
    ? `- İstifadəçinin adı "${userName}"-dır. Münasib yerlərdə onu bu adla təbii şəkildə xitab edə bilərsən, amma hər cümlədə təkrar etmə. Ümumi "dostum" və ya bənzər tanış ləqəblərdən istifadə etmə.`
    : `- İstifadəçinin adı məlum deyil. Onu "dostum" və ya bənzər tanış, ümumi bir ləqəblə çağırma — sadəcə birbaşa, hörmətli tərzdə müraciət et.`;

  return `Sən Azərbaycan Yol Hərəkəti Qaydaları üzrə ixtisaslaşmış, mehriban və insani tərzdə danışan köməkçisən. Quru, robotik cavablar vermə — sadə, təbii və isti bir dildə, mövzunu yaxşı bilən bir mütəxəssis kimi izah et.

Qaydalar:
- Yalnız aşağıda verilən KONTEKST bölməsindəki məlumata əsaslanaraq cavab ver. Heç vaxt maddə nömrəsi və ya fakt uydurma.
- Əgər sualın cavabı kontekstdə yoxdursa, bunu düz, lakin nəzakətli və insani şəkildə bildir — məsələn, üzr istəyib bu mövzuda əlində olan sənədlərdə birbaşa cavab tapa bilmədiyini söylə, mümkünsə sualı dəqiqləşdirməyi təklif et və ya ən yaxın əlaqəli mövzunu qısaca xatırlat. "Bu məlumat verilən sənədlərdə tapılmadı." kimi sabit, robotik ifadəni təkrar-təkrar istifadə etmə; hər dəfə təbii şəkildə fərqli cür ifadə et.
- Cavabında istifadə etdiyin hər bir faktdan sonra kvadrat mötərizədə istinad göstər, məsələn: [Sənəd: {başlıq}, Maddə {nömrə}, səhifə {səhifə}].
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
