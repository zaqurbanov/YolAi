import 'server-only';
import { getRewriteModelChain, getProviderCallOptions } from '@/lib/llm';
import { generateTextWithRouting } from '@/lib/llm/fallback';
import { logError } from '@/lib/logging/logError';

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

// Deterministic scope gate. buildPrompt.ts's out-of-scope rule stays as the
// second line of defense, but the models at the head of getChatModelChain()
// (Groq qwen3.6-27b, mistral-small) do not reliably execute "refuse and STOP"
// negative instructions — observed live: the model refused a package-manager
// question and then answered it anyway, markdown included. So the answering
// model must not be called at all for an out-of-scope question. The
// classification rides the rewrite call this module already makes, so it adds
// no extra LLM call and no extra latency to a normal question.
const OUT_OF_SCOPE_SENTINEL = 'KƏNAR_MÖVZU';

const SCOPE_GATE_RULES = `MÖVZU YOXLAMASI (sorğunu yenidən yazmazdan ƏVVƏL bu iki addımı bu ardıcıllıqla et):

ADDIM 1 — İSTİSNALAR. Aşağıdakılar HEÇ VAXT kənar mövzu deyil, onlar üçün ${OUT_OF_SCOPE_SENTINEL} YAZMA:
- Salamlaşma, təşəkkür və qısa söhbət: "salam", "necəsən", "sağ ol", "təşəkkür".
- Köməkçinin ÖZÜ haqqında suallar: "sən kimsən?", "kimsən?", "adın nədir?", "nə edə bilirsən?", "nə bacarırsan?", "necə kömək edə bilərsən?". Bunlar ümumi bilik sualı DEYİL — bunlar bu söhbət köməkçisi haqqındadır, ona görə həmişə adi qaydada davam et.

ADDIM 2 — yalnız yuxarıdakı istisnalar tutmadıqda: sual Azərbaycan yol hərəkəti / sürücülük sahəsinə aiddirmi?
- ƏGƏR sual bu sahəyə TAMAMİLƏ aid deyilsə (proqramlaşdırma, terminal əmrləri, riyaziyyat, yemək reseptləri, siyasət, tibb, tarix, idman, ümumi bilik və s.), cavab olaraq YALNIZ bu bir sözü yaz: ${OUT_OF_SCOPE_SENTINEL}
  Başqa heç nə yazma — nə izahat, nə sorğu, nə də sualın cavabı.
- AİD SAYILIR (bunlar üçün HEÇ VAXT ${OUT_OF_SCOPE_SENTINEL} yazma): yük daşınması, sığorta, texniki baxış, sürücülük vəsiqəsi, yol qəzası, piyada, velosiped, cərimə/cəza, yol nişanları, sürət həddi, park etmə, nəqliyyat vasitəsinin qeydiyyatı, yol polisi və bənzər mövzular.
- Şübhə varsa, ${OUT_OF_SCOPE_SENTINEL} YAZMA — adi sorğu yenidənyazması qaytar.

ADDIM 3 — SÖHBƏTİN DAVAMI. Sənə "Söhbətin son mesajları" verilibsə, yeni sualı TƏK BAŞINA deyil, həmin mesajların davamı kimi qiymətləndir:
- Əgər sual əvvəlki söhbətin davamıdırsa (əvəzlik, ellipsis, "bəs", "onda", "o zaman", "nə qədər", "neçə manat" kimi qısa davam formaları) və əvvəlki mövzu yol hərəkəti qaydaları ilə bağlı idisə — sual SAHƏYƏ AİDDİR, ${OUT_OF_SCOPE_SENTINEL} YAZMA.
- Nümunə (AİDDİR): əvvəlki sual "qırmızı işıqda keçsəm nə olar?" → yeni sual "bəs nə qədər ödəniş edəcəm?". Bu, həmin pozuntunun cərimə məbləği haqqındadır — adi qaydada sorğunu yenidən yaz və onu əvvəlki mövzunun terminləri ilə tamamla.
- Nümunə (AİDDİR): əvvəlki sual "sığorta olmadan sürsəm nə olar?" → yeni sual "bəs o?" və ya "neçə manatdır?".
- Nümunə (AİD DEYİL): əvvəlki mövzu yol hərəkəti ilə bağlı olsa belə, yeni sual TAM MÜSTƏQİLdirsə və açıq-aydın başqa sahədəndirsə (məsələn "sadə paket yükləmək üçün hansı əmrləri yazmalıyam?"), bu KƏNAR MÖVZUDUR — ${OUT_OF_SCOPE_SENTINEL} yaz. Söhbətin yol hərəkəti ilə başlaması sonrakı istənilən sualı sahəyə aid etmir.`;

// Exact match only (after stripping punctuation/whitespace): a response that
// merely *mentions* the sentinel is ambiguous and is treated as in-scope. The
// non-diacritic spelling is accepted because models routinely drop ə/ö on
// Azerbaijani output.
function isOutOfScopeSentinel(text: string): boolean {
  const normalized = text.trim().toUpperCase().replace(/[^A-ZƏÖÜÇŞĞİI_]/g, '');
  return normalized === OUT_OF_SCOPE_SENTINEL || normalized === 'KENAR_MOVZU';
}

function mentionsSentinel(text: string): boolean {
  return /K[ƏE]NAR[_ ]?M[ÖO]VZU/i.test(text);
}

// Deterministic veto over the classifier. Measured against the live rewrite
// model (llama-3.3-70b-versatile): "sən kimsən?" was classified as out of scope
// even with an explicit rule naming it, because it reads as a general-knowledge
// question. Greetings and "who are you" are the two messages every new user
// sends first, so refusing them is the worst possible failure of this gate —
// exact-match (whole message, diacritics/punctuation folded) so it can't be used
// as a prefix to smuggle an off-topic question past the classifier.
const GREETING_META_MESSAGES = new Set([
  'salam', 'salam aleykum', 'salamlar', 'hi', 'hello', 'necesen', 'salam necesen',
  'sag ol', 'sagol', 'cox sag ol', 'coxsagol', 'tesekkur', 'tesekkur edirem', 'tesekkurler',
  'sen kimsen', 'kimsen', 'sen nesen', 'adin nedir', 'senin adin nedir',
  'ne ede bilersen', 'ne ede bilirsen', 'ne bacarirsan', 'nece komek ede bilersen',
  'komek', 'komek ede bilersen', 'bura ne ucundur',
]);

function foldAzerbaijani(text: string): string {
  return text
    .toLowerCase()
    .replace(/ə/g, 'e')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/[^a-z\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isGreetingOrMeta(query: string): boolean {
  return GREETING_META_MESSAGES.has(foldAzerbaijani(query));
}

// Short, warm, markdown-free (buildPrompt.ts's no-markdown rule applies to
// anything rendered in the chat bubble). Picked at random so a user who asks
// two off-topic questions in a row doesn't get the identical robotic sentence.
const SCOPE_REFUSALS = [
  'Bağışlayın, mən yalnız Azərbaycan yol hərəkəti qaydaları üzrə kömək edə bilirəm. Sürücülük, yol nişanları, cərimələr və ya yol təhlükəsizliyi ilə bağlı istənilən sualı verin — məmnuniyyətlə cavablandıraram.',
  'Təəssüf ki, bu sual mənim sahəmə aid deyil. Mən yalnız Azərbaycan Yol Hərəkəti Qaydaları üzrə suallara cavab verirəm — yol nişanları, sürət həddi, cərimələr, qəza və sənədlərlə bağlı nə istəsəniz soruşa bilərsiniz.',
  'Bu mövzuda kömək edə bilmərəm — mənim ixtisasım yalnız Azərbaycan yol hərəkəti qaydalarıdır. Sürücülük və yol təhlükəsizliyi ilə bağlı sualınız varsa, buyurun.',
  'Mən yol hərəkəti qaydaları üzrə köməkçiyəm, ona görə bu suala cavab verə bilmirəm. Amma sürücülük, cərimələr, yol nişanları və ya qəza qaydaları barədə istənilən sualınıza kömək edərəm.',
];

export function pickScopeRefusal(): string {
  return SCOPE_REFUSALS[Math.floor(Math.random() * SCOPE_REFUSALS.length)];
}

/** One prior conversation turn, already flattened to plain text and truncated
 * by the caller (see extractClassifierTurns in app/api/chat/route.ts). */
export interface ClassifierTurn {
  role: 'user' | 'assistant';
  text: string;
}

// Stateless detection of "the previous answer was itself a scope refusal".
// SCOPE_REFUSALS is a fixed, closed set written verbatim into the messages row
// by the refusal path, so matching against it needs no extra column and no
// extra query. Prefix-compared (not just equality) so a future trailing
// addition to a refusal string doesn't silently stop matching history rows
// written by the current version.
const REFUSAL_PREFIX_LENGTH = 40;

function isScopeRefusalText(text: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0) return false;
  return SCOPE_REFUSALS.some((refusal) => {
    const candidate = refusal.replace(/\s+/g, ' ');
    return normalized === candidate || normalized.startsWith(candidate.slice(0, REFUSAL_PREFIX_LENGTH));
  });
}

// Belt-and-braces over the classifier, deliberately SHAPE-based rather than
// "anything inside an in-scope conversation passes" — the blanket version lets
// a fully self-contained off-topic question ("sadə paket yükləmək üçün hansı
// əmrləri yazmalıyam?") through as soon as the conversation opened on topic,
// which is the exact bug the gate exists to stop. A rescue requires ALL of:
// short, carries an elliptical continuation marker, and follows a real
// (non-refused) assistant answer.
const CONTINUATION_MAX_WORDS = 6;
// Discourse connectives that essentially only occur as a continuation of the
// previous turn — safe to match anywhere within a short message.
const CONTINUATION_MARKERS = /\b(bes|onda|o zaman|hemin|sonra)\b/;
// Weaker signals: "neçə"/"nə qədər" and bare pronouns also occur inside
// perfectly self-contained questions, so they only count when the message is
// little more than the marker itself. Measured: a single-tier version matching
// "nece" anywhere rescued "React-də useEffect necə işləyir?" — a genuinely
// off-topic question — inside an in-scope conversation.
const SHORT_CONTINUATION_MAX_WORDS = 3;
const SHORT_CONTINUATION_MARKERS = /\b(nece|ne qeder|o|bu|onu|bunu|onun|bunun|onlar|bunlar|onlari|bunlari)\b/;

function isContinuationShaped(query: string): boolean {
  const folded = foldAzerbaijani(query);
  const wordCount = folded.split(' ').filter(Boolean).length;
  if (wordCount === 0 || wordCount > CONTINUATION_MAX_WORDS) return false;
  if (CONTINUATION_MARKERS.test(folded)) return true;
  return wordCount <= SHORT_CONTINUATION_MAX_WORDS && SHORT_CONTINUATION_MARKERS.test(folded);
}

function isRescuedContinuation(query: string, turns: ClassifierTurn[]): boolean {
  const lastAnswer = [...turns].reverse().find((t) => t.role === 'assistant');
  if (!lastAnswer || isScopeRefusalText(lastAnswer.text)) return false;
  return isContinuationShaped(query);
}

function buildTurnsBlock(turns: ClassifierTurn[]): string {
  if (turns.length === 0) return '';
  const lines = turns.map((t) => `${t.role === 'user' ? 'İstifadəçi' : 'Köməkçi'}: "${t.text}"`);
  return `Söhbətin son mesajları (yeni sualın nəyə istinad etdiyini anlamaq üçün; buradakı faktları sorğuya köçürmə):\n${lines.join('\n')}\n\n`;
}

export interface RewriteResult {
  /** True only on an unambiguous classifier verdict — every error, timeout,
   * empty or unexpected output falls open to false (see rewriteQuery). */
  outOfScope: boolean;
  query: string;
}

function isUsableRewrite(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (trimmed.length > MAX_REWRITTEN_LENGTH) return false;
  return true;
}

export async function rewriteQuery(
  query: string,
  contextSummary?: object,
  // Opt-in, and off by default: a caller that hasn't thought about the refusal
  // path must never accidentally get one. app/api/chat/route.ts turns it on for
  // text messages only — see the call site for why image requests skip it.
  // `recentTurns` is the PRIMARY conversation signal for the gate; the
  // contextSummary above is supplementary only (it's produced by a separate LLM
  // call that can fail, and is empty for the first several messages).
  options: { scopeGate?: boolean; recentTurns?: ClassifierTurn[] } = {},
): Promise<RewriteResult> {
  const scopeGate = options.scopeGate ?? false;
  const recentTurns = options.recentTurns ?? [];
  const skipRewrite = isAlreadySpecific(query);

  // isAlreadySpecific normally short-circuits the whole LLM call. With the
  // scope gate on we make the call anyway and simply DISCARD the rewrite,
  // keeping the raw query for retrieval exactly as before. Rationale: padding
  // an off-topic question past 25 words would otherwise be a one-line bypass
  // of the gate, and the misbehaviour this gate exists to stop is most likely
  // on exactly those long, argumentative messages. Cost is the ~1-2s rewrite
  // latency on >=25-word messages, which are rare here.
  if (skipRewrite && !scopeGate) return { outOfScope: false, query };

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
    const { text } = await generateTextWithRouting(getRewriteModelChain(), {
      system: scopeGate ? `${SCOPE_GATE_RULES}\n\n${REWRITE_PROMPT}` : REWRITE_PROMPT,
      prompt: `${buildTurnsBlock(recentTurns)}İstifadəçinin sualı: "${query}"${contextBlock}`,
      providerOptions: getProviderCallOptions(),
      temperature: 0,
      // Bounds worst-case generation latency: without this, a model can keep
      // generating well past what a useful rewrite needs, and every extra
      // token adds directly to rewriteMs. 150 tokens (~300-450 chars at ~2-3
      // chars/token for Azerbaijani) sits comfortably above real rewrite
      // output but well below MAX_REWRITTEN_LENGTH-worth of runaway text.
      maxOutputTokens: 150,
    });

    if (scopeGate && isOutOfScopeSentinel(text)) {
      if (isGreetingOrMeta(query)) return { outOfScope: false, query };
      if (isRescuedContinuation(query, recentTurns)) return { outOfScope: false, query };
      return { outOfScope: true, query };
    }
    // Sentinel buried in a longer answer: verdict is ambiguous, so fail open —
    // but the text is unusable as a retrieval query, so keep the raw one.
    if (scopeGate && mentionsSentinel(text)) return { outOfScope: false, query };
    if (skipRewrite) return { outOfScope: false, query };
    if (!isUsableRewrite(text)) return { outOfScope: false, query };
    return { outOfScope: false, query: text.trim() };
  } catch (err) {
    void logError('rag.rewriteQuery', err);
    console.error('[rewriteQuery] failed to rewrite query, falling back to raw query:', err);
    // Fail open on every error path: wrongly refusing a real traffic-law
    // question is far worse than letting an off-topic one through to the
    // prompt-level defense in buildPrompt.ts.
    return { outOfScope: false, query };
  }
}
