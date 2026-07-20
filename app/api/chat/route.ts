import {
  convertToModelMessages,
  toUIMessageStream,
  createUIMessageStreamResponse,
  APICallError,
  RetryError,
  type UIMessage,
  type FileUIPart,
} from 'ai';
import { getChatModel, getChatModelFallback, getChatModelId, getChatModelFallbackId, getProviderCallOptions, isVisionAvailable } from '@/lib/llm';
import { streamTextWithFallback } from '@/lib/llm/streamWithFallback';
import { identifySignFromImage } from '@/lib/rag/identifySignFromImage';
import { retrieveRelevantChunks, retrievePerDocumentChunks, retrieveChunksByArticle, embedQueryWithActiveModel, type RetrievedChunk } from '@/lib/retrieval/search';
import { extractArticleReferences, articleLabelPrefixes, isPureArticleReferenceQuery } from '@/lib/retrieval/articleQuery';
import { buildSystemPrompt, buildContextBlock, buildCitations, filterCitedChunks } from '@/lib/rag/buildPrompt';
import { shouldUpdateSummary, updateContextSummary } from '@/lib/rag/contextSummary';
import { rewriteQuery } from '@/lib/rag/rewriteQuery';
import { rerankChunks } from '@/lib/rag/rerank';
import { randomBytes } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, notFound, serverError, unauthorized } from '@/lib/api/errors';
import { checkChatRateLimit } from '@/lib/chat/rateLimit';
import {
  checkAndReserveCoins,
  debitCoins,
  getCoinBalanceStatus,
  DEFAULT_DAILY_LIMIT,
} from '@/lib/chat/coins';
import { claimPendingReferral } from '@/lib/coins/referrals';

// Conversation history / quota used to live at app/api/chat/history/route.ts.
// Folded in here behind `?type=history` (`?type=quota` for the balance probe)
// to stay under the Vercel Hobby serverless-function cap — see CLAUDE.md.
// The streaming RAG endpoint is the no-`type` POST. Every handler below
// authenticates FIRST, unconditionally, before looking at `type`.
type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

const MESSAGE_WINDOW = 10;
const IMAGE_PLACEHOLDER_CONTENT = '[Şəkil göndərildi]';

export const maxDuration = 60;

function findImagePart(message: UIMessage | undefined): FileUIPart | null {
  const part = message?.parts?.find(
    (p): p is FileUIPart => p.type === 'file' && p.mediaType?.startsWith('image/'),
  );
  return part ?? null;
}

function toClientErrorMessage(error: unknown): string {
  const cause = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(cause)) {
    if (cause.statusCode === 429) {
      return 'Model hazırda həddindən artıq yüklənib (rate limit). Bir azdan yenidən cəhd edin.';
    }
    return `Model xətası: ${cause.message}`;
  }
  return 'Cavab alınarkən xəta baş verdi. Bir azdan yenidən cəhd edin.';
}

interface ConversationState {
  id: string;
  contextSummary: object;
  summaryMessageCount: number;
  title: string | null;
}

class ConversationNotFoundError extends Error {}

function truncateTitle(raw: string): string {
  const trimmed = raw.trim();
  const MAX = 50;
  if (trimmed.length <= MAX) return trimmed;

  const cut = trimmed.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const boundary = lastSpace > 20 ? cut.slice(0, lastSpace) : cut;
  return `${boundary.trim()}…`;
}

async function getOrCreateConversation(userId: string, conversationId?: string): Promise<ConversationState> {
  const supabase = await createClient();

  if (conversationId) {
    // RLS (conversations_select_own) already scopes this to the caller, but
    // the .eq('user_id', ...) below is defense-in-depth, not a substitute
    // for it. A missing/foreign id must never silently fall back to
    // creating a new conversation — the frontend already has this id in the
    // URL, and a silent swap would be confusing.
    const { data: existing, error } = await supabase
      .from('conversations')
      .select('id, context_summary, summary_message_count, title')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!existing) throw new ConversationNotFoundError();

    return {
      id: existing.id,
      contextSummary: existing.context_summary ?? {},
      summaryMessageCount: existing.summary_message_count ?? 0,
      title: existing.title ?? null,
    };
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId })
    .select('id, context_summary, summary_message_count, title')
    .single();

  if (error) throw error;
  return {
    id: created.id,
    contextSummary: created.context_summary ?? {},
    summaryMessageCount: created.summary_message_count ?? 0,
    title: created.title ?? null,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Hard auth gate, first statement after resolving the caller and before any
  // branching. Everything below (rate limiting, coin reservation, the coin
  // debit in onFinish) is scoped by `if (user && !isAdmin)`, so an anonymous
  // caller previously fell through ALL of it and got unmetered,
  // unauthenticated access to the LLM — confirmed live: a plain
  // `curl -X POST /api/chat` with no cookie returned a full streamed
  // response, billed to this project's provider keys. proxy.ts does not help
  // here: it only guards page prefixes ('/chat', '/admin', '/account',
  // '/oyrenme'), and '/api/chat' matches none of them. There is no legitimate
  // anonymous entry point — the chat UI itself sits behind that same proxy
  // guard — so this rejects rather than degrades. It also covers the
  // folded-in `?type=history` operations below.
  if (!user) return unauthorized();

  if (new URL(request.url).searchParams.get('type') === 'history') {
    return historyPost(request, supabase, user.id);
  }

  const requestId = crypto.randomUUID();
  let messages: UIMessage[];
  let documentId: string | undefined;
  let conversationId: string | undefined;
  try {
    ({ messages, documentId, conversationId } = await request.json());
  } catch (err) {
    return apiError(400, 'Yanlış sorğu formatı', { cause: err });
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUserMessage?.parts?.map((p) => ('text' in p ? p.text : '')).join(' ') ?? '';
  const imagePart = findImagePart(lastUserMessage);

  // isVisionAvailable() is a sync, no-network check — safe to gate here,
  // before any DB call (user/profile lookup, coin reservation, conversation
  // creation) or retrieval, so an unsupported-config request costs nothing.
  if (imagePart && !isVisionAvailable()) {
    return apiError(422, 'Şəkil analizi hazırda əlçatan deyil. Zəhmət olmasa sualınızı mətn kimi yazın.', {
      code: 'vision_unavailable',
    });
  }

  // The user-facing persisted content for an image message is the typed
  // caption if any, else a fixed placeholder — never the vision model's
  // internal identification string (see identifySignFromImage.ts), which is
  // only ever used as an ephemeral retrieval query below, not as "what the
  // user said".
  const userMessageContent = imagePart ? (query.trim() || IMAGE_PLACEHOLDER_CONTENT) : query;

  const userName =
    user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? (user?.email ? user.email.split('@')[0] : null) ?? null;

  // Real server-side admin check (profiles.role) — proxy.ts only does an optimistic
  // cookie check and is never sufficient authorization on its own. Awaited immediately
  // (rather than kicked off to run concurrently with retrieval/rewrite, as before) so
  // the per-user rate limit check right below can gate a non-admin request before any
  // expensive work (retrieval, embedding, LLM call) starts — a rejected request must
  // cost nothing beyond this one indexed `profiles` PK lookup.
  const profilePromise: Promise<{ role: string | null } | undefined> = user
    ? Promise.resolve(
        supabase.from('profiles').select('role').eq('id', user.id).single(),
      ).then(({ data }) => data ?? undefined)
    : Promise.resolve(undefined);
  const profile = await profilePromise;
  const isAdmin = profile?.role === 'admin';

  // Anti-spam min-spacing check still runs via check_chat_rate_limit/
  // chat_rate_limits (0023) — that concern is orthogonal to coin balance and
  // is left entirely as-is. The message-count half of that RPC is
  // deliberately neutralized here (not removed from the SQL, to avoid
  // touching 0023/0028) by passing an effectively-unlimited max, so only
  // reason='spacing' can ever reject; the coin economy below is now the sole
  // source of count-style rejection.
  // p_max_per_window binds to a Postgres `int` (4-byte, max ~2.1e9) in
  // check_chat_rate_limit — Number.MAX_SAFE_INTEGER would overflow that
  // column type, so this uses int4's actual max instead.
  const SPACING_ONLY_MAX_PER_DAY = 2147483647;

  // Coin gating applies to regular (non-admin) authenticated users only.
  // Unauthenticated requests are out of scope here — left as-is. Checked
  // before any conversation/message rows are created, before rewriteQuery/
  // retrieval, and before any LLM call, so a rejected request writes nothing,
  // calls no embedding or LLM API, and spends no coins (see debitCoins call
  // in onFinish below — spending only happens on a fully successful stream).
  // Captured here (rather than re-derived later) so messageMetadata below can
  // surface the post-debit balance without a second query. Stays null for
  // admins/unauthenticated users (coin gating doesn't apply) and for the
  // fail-open RPC-error case — messageMetadata treats null as "omit coins
  // metadata", which the frontend treats as "don't show".
  let coinPrice: number | null = null;
  let coinBalance: number | null = null;
  if (user && !isAdmin) {
    const { allowed: spacingAllowed, message: spacingMessage } = await checkChatRateLimit(
      user.id,
      SPACING_ONLY_MAX_PER_DAY,
    );
    if (!spacingAllowed) {
      return apiError(429, spacingMessage!, { code: 'rate_limited' });
    }

    const { allowed, message, balance, price } = await checkAndReserveCoins(user.id);
    if (!allowed) {
      return apiError(402, message!, { code: 'insufficient_coins' });
    }
    coinPrice = price;
    coinBalance = balance;
  }

  // Kicked off only after coin gating has passed (or been bypassed for
  // admin/anonymous requests) — this is a real vision LLM call and must
  // respect the same "no LLM call before the coin gate" invariant as the
  // main chat model below. Run concurrently with the conversation/message
  // persistence work right below (which doesn't depend on it) and only
  // awaited once its result is actually needed, ahead of rewriteQuery.
  const identifyPromise: Promise<string> | null = imagePart ? identifySignFromImage(imagePart) : null;

  let conversation: ConversationState | null = null;
  // Reserved synchronously (before streaming starts) so the id is available to
  // `messageMetadata` on every streamed chunk. `messageMetadata` in the installed
  // `ai@7.0.16` is called synchronously per stream part and is NOT awaited even if
  // it returns a Promise, and the streamText `onFinish` callback (where the final
  // assistant text becomes known) only runs *after* the "finish" chunk has already
  // been forwarded to `messageMetadata` — so an id captured inside onFinish would
  // always arrive one chunk too late. Inserting a placeholder row up front and
  // updating it in onFinish is the only way to make the id available in time.
  let assistantMessageId: string | null = null;
  if (user) {
    try {
      conversation = await getOrCreateConversation(user.id, conversationId);

      const { error: userMessageError } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: userMessageContent,
      });

      if (userMessageError) throw userMessageError;

      const { data: placeholder, error: placeholderError } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversation.id,
          role: 'assistant',
          content: '',
        })
        .select('id')
        .single();

      if (placeholderError) throw placeholderError;
      assistantMessageId = placeholder.id;

      // updated_at drives the sidebar's "most recent activity" ordering;
      // title is set once, from the raw first user message, truncated at a
      // word boundary — no LLM call, to avoid extra latency/cost on every
      // request just to name the chat.
      const conversationUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (conversation.title === null) {
        conversationUpdate.title = truncateTitle(userMessageContent);
      }
      const { error: touchError } = await supabase
        .from('conversations')
        .update(conversationUpdate)
        .eq('id', conversation.id);
      if (touchError) console.error('[chat] failed to touch conversation:', touchError);
    } catch (err) {
      if (err instanceof ConversationNotFoundError) {
        return apiError(404, 'Söhbət tapılmadı', { code: 'not_found' });
      }
      return serverError(err, 'Söhbəti yaratmaq uğursuz oldu');
    }
  }

  // For an image message, everything downstream that would normally operate
  // on the raw typed query (rewriteQuery, the raw-query retrieval hedge,
  // article-number detection, trigram search, rerank's relevance judge)
  // instead operates on the vision model's short identification string —
  // the raw query here is just the caption/placeholder, which usually isn't
  // a meaningful retrieval signal on its own. buildContextBlock/
  // buildCitations/buildSystemPrompt are untouched — they only ever see
  // whatever relevantChunks retrieval returns for retrievalSourceText.
  let retrievalSourceText = query;
  if (imagePart && identifyPromise) {
    try {
      retrievalSourceText = await identifyPromise;
    } catch (err) {
      console.error('[chat] identifySignFromImage failed, falling back to raw query text:', err);
    }
  }

  const rewriteStart = performance.now();
  const retrievalQuery = await rewriteQuery(retrievalSourceText, conversation?.contextSummary);
  const rewriteMs = performance.now() - rewriteStart;

  // Primary corpus-wide search, plus (unless the UI already scoped this chat
  // to one document) a supplementary search guaranteeing every ready
  // document a foothold in the pool — see retrievePerDocumentChunks()'s doc
  // comment in search.ts for why this replaces the old chunk-count-threshold
  // "small document" boost: any document, regardless of absolute size, can
  // be crowded out of a fixed-width corpus-wide top-N, and a fixed cutoff
  // misclassifies documents whenever they're uploaded/reprocessed and happen
  // to cross it. Purely additive — merged into, never replacing, the primary
  // result set — so rerank.ts still has the final say on what's actually
  // relevant.
  // rewriteQuery is an LLM call and not fully deterministic even at
  // temperature 0 (provider-side variance) — a drifted rewrite can shift the
  // embedding enough that a query which would otherwise retrieve correctly
  // misses entirely, run to run (confirmed live: the same question sometimes
  // found its target chunk, sometimes didn't, with no code change in
  // between). The raw user query costs nothing extra to also search on
  // (already computed, already used for trigram matching) and is the one
  // deterministic input in this pipeline, so it's used as a second,
  // always-present corpus-wide search alongside the rewritten one — a
  // stability hedge, not a replacement for rewriting (which still helps
  // vocabulary-poor queries reach documents the raw wording alone wouldn't).
  // Skipped when rewriting left the query unchanged (isAlreadySpecific/
  // failure fallback in rewriteQuery.ts), since it would just be a duplicate
  // of the primary call below.
  const rawQueryDiffersFromRewrite = retrievalQuery !== retrievalSourceText;

  // Article-number fast path (0032) — detected off the RAW query only, never
  // the rewritten one (rewriteQuery.ts can hallucinate/drift, and an
  // invented article number would silently retrieve the wrong article — see
  // articleQuery.ts's header comment). When the query is essentially just an
  // article reference ("Maddə 65", "Maddə 65 nə deyir"), the trigram scan
  // this fast path bypasses adds nothing (short numeric tokens are filtered
  // out of trigram scoring entirely, see match_chunks_by_article's migration
  // comment) — skip passing ftsQuery to the other retrieval calls in that
  // case to also save that cost on the primary/per-document searches. Never
  // skipped when there's substantial additional free text alongside the
  // article number, since trigram still adds value there.
  const articleRefs = extractArticleReferences(retrievalSourceText);
  const articlePrefixes = articleLabelPrefixes(articleRefs);
  const skipTrigram = isPureArticleReferenceQuery(retrievalSourceText, articleRefs);
  const ftsQueryForSearch = skipTrigram ? undefined : retrievalSourceText;

  // Only TWO distinct texts are ever embedded per request (the rewritten
  // query and — when it differs — the raw user query), but four retrieval
  // calls below consume them: the rewritten query feeds the primary,
  // per-document AND article searches. Embedding inside each call meant
  // computing the identical vector up to 3 times per request, pure wasted
  // work (and, were embedding ever moved behind a paid API, 3 billed calls
  // instead of 1). Embed each distinct text once here and pass the vectors
  // down via `precomputedEmbedding`.
  const embedStart = performance.now();
  const [retrievalQueryEmbedding, rawQueryEmbedding] = await Promise.all([
    embedQueryWithActiveModel(retrievalQuery),
    rawQueryDiffersFromRewrite ? embedQueryWithActiveModel(retrievalSourceText) : Promise.resolve(null),
  ]);
  const queryEmbedMs = performance.now() - embedStart;

  const [primaryResult, rawQueryResult, perDocumentResult, articleResult] = await Promise.all([
    retrieveRelevantChunks({
      embedQuery: retrievalQuery,
      ftsQuery: ftsQueryForSearch,
      documentId,
      precomputedEmbedding: retrievalQueryEmbedding,
    }),
    rawQueryDiffersFromRewrite && rawQueryEmbedding
      ? retrieveRelevantChunks({
          embedQuery: retrievalSourceText,
          ftsQuery: ftsQueryForSearch,
          documentId,
          precomputedEmbedding: rawQueryEmbedding,
        })
      : null,
    documentId ? null : retrievePerDocumentChunks(retrievalQuery, ftsQueryForSearch, retrievalQueryEmbedding),
    articlePrefixes.length > 0
      ? retrieveChunksByArticle(retrievalQuery, articlePrefixes, retrievalQueryEmbedding)
      : null,
  ]);

  const seenChunkIds = new Set(primaryResult.chunks.map((c) => c.id));
  const mergedChunks = [...primaryResult.chunks];
  for (const source of [rawQueryResult, perDocumentResult, articleResult]) {
    if (!source) continue;
    for (const chunk of source.chunks) {
      if (seenChunkIds.has(chunk.id)) continue;
      seenChunkIds.add(chunk.id);
      mergedChunks.push(chunk);
    }
  }
  // Sorted by combined_score (descending) before reaching rerank.ts's own
  // candidate cap, so a merged pool larger than that cap loses its weakest
  // candidates, not an arbitrary suffix determined by which source happened
  // to be concatenated first — see rerank.ts's MAX_RERANK_CANDIDATES comment
  // for the bug this fixes. articleResult's rows carry a fixed combined_score
  // of 1.0 (see match_chunks_by_article's migration comment), so an exact
  // article-number match always sorts first here.
  const initialChunks = mergedChunks.sort((a, b) => b.combined_score - a.combined_score);

  // Embedding now happens once per distinct text above (see queryEmbedMs), so
  // the per-call embedMs values are all 0 — summing them would under-report
  // the real cost in chat_request_timing. Report the actual measured time.
  const embedMs = queryEmbedMs;
  const dbSearchMs =
    primaryResult.dbSearchMs +
    (rawQueryResult?.dbSearchMs ?? 0) +
    (perDocumentResult?.dbSearchMs ?? 0) +
    (articleResult?.dbSearchMs ?? 0);

  const { keptIds, rerankMs } = await rerankChunks(retrievalSourceText, initialChunks);
  let relevantChunks: RetrievedChunk[];
  if (keptIds) {
    const chunkById = new Map(initialChunks.map((c) => [c.id, c]));
    relevantChunks = keptIds
      .map((id) => chunkById.get(id))
      .filter((c): c is RetrievedChunk => c !== undefined);
  } else {
    relevantChunks = initialChunks.slice(0, 15);
  }

  const contextBlock = buildContextBlock(relevantChunks);

  const summaryBlock = conversation && Object.keys(conversation.contextSummary).length > 0
    ? `\n\nSÖHBƏTİN XÜLASƏSİ (əvvəlki mesajlardan qısa yaddaş, yalnız kontekst üçündür, faktları yenidən sitat gətirmə mənbəyi kimi istifadə etmə):\n${JSON.stringify(conversation.contextSummary)}`
    : '';

  const windowedMessages = messages.slice(-MESSAGE_WINDOW);

  const llmStartTime = performance.now();
  let llmFirstTokenMs: number | null = null;
  // Accumulated from text-delta parts as they stream through onChunk, so the
  // full answer text is already available by the time messageMetadata is
  // called for the 'finish' UI part (which itself carries no text) — used to
  // filter citations down to chunks the model actually referenced. onFinish's
  // own `text` param is the authoritative source for the same filtering when
  // persisting to the DB below.
  let liveAnswerText = '';

  const fallbackModel = getChatModelFallback();
  const fallbackModelId = getChatModelFallbackId();

  const { stream: rawStream, usedFallback, modelUsed } = await streamTextWithFallback(
    { model: getChatModel(), modelId: getChatModelId() },
    fallbackModel && fallbackModelId ? { model: fallbackModel, modelId: fallbackModelId } : null,
    {
      system: `${buildSystemPrompt(userName)}\n\nKONTEKST:\n${contextBlock || 'Heç bir uyğun məlumat tapılmadı.'}${summaryBlock}`,
      messages: await convertToModelMessages(windowedMessages),
      providerOptions: getProviderCallOptions(),
      onChunk: ({ chunk }) => {
        if (llmFirstTokenMs === null) {
          llmFirstTokenMs = performance.now() - llmStartTime;
        }
        if (chunk.type === 'text-delta') {
          liveAnswerText += chunk.text;
        }
      },
      onFinish: async ({ text, usage }) => {
        const llmTotalMs = performance.now() - llmStartTime;
        const citations = buildCitations(filterCitedChunks(relevantChunks, text));
        const promptTokens = usage?.inputTokens ?? null;
        const completionTokens = usage?.outputTokens ?? null;
        const totalTokens = usage?.totalTokens ?? null;

        try {
          console.log(
            JSON.stringify({
              event: 'chat_request_timing',
              requestId,
              usedFallback,
              rewriteMs,
              embedMs,
              dbSearchMs,
              rerankMs,
              llmFirstTokenMs,
              llmTotalMs,
              promptTokens,
              completionTokens,
              totalTokens,
              query,
            }),
          );
        } catch (err) {
          console.error('[chat] failed to emit timing log:', err);
        }

        createAdminClient()
          .from('chat_request_logs')
          .insert({
            request_id: requestId,
            conversation_id: conversation?.id ?? null,
            message_id: assistantMessageId,
            query,
            rewrite_ms: rewriteMs,
            embed_ms: embedMs,
            db_search_ms: dbSearchMs,
            rerank_ms: rerankMs,
            llm_first_token_ms: llmFirstTokenMs,
            llm_total_ms: llmTotalMs,
            used_fallback: usedFallback,
            model_used: modelUsed,
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          })
          .then(({ error }) => {
            if (error) console.error('[chat] failed to persist request timing log:', error);
          });

        if (!conversation) return;

        const conversationId = conversation.id;
        const previousSummary = conversation.contextSummary;
        const summaryMessageCount = conversation.summaryMessageCount;

        if (assistantMessageId) {
          const { error: updateError } = await supabase
            .from('messages')
            .update({ content: text, citations })
            .eq('id', assistantMessageId);
          if (updateError) console.error('[chat] failed to persist assistant message:', updateError);
        } else {
          // Should not happen (assistantMessageId is only null when `conversation` is
          // also null, and we already returned above in that case) — kept as a safety
          // net so a future refactor that breaks that invariant fails soft, not silent.
          await supabase.from('messages').insert({
            conversation_id: conversationId,
            role: 'assistant',
            content: text,
            citations,
          });
        }

        try {
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversationId);

          const totalMessageCount = count ?? 0;

          if (shouldUpdateSummary(totalMessageCount, summaryMessageCount)) {
            const newSummary = await updateContextSummary(
              previousSummary,
              [
                { role: 'user', content: query },
                { role: 'assistant', content: text },
              ],
              totalMessageCount,
            );

            const { data: updated } = await supabase
              .from('conversations')
              .update({ context_summary: newSummary, summary_message_count: totalMessageCount })
              .eq('id', conversationId)
              .select('id');

            if (!updated || updated.length === 0) {
              console.warn(
                `[chat] context summary update matched no row for conversation ${conversationId} (check RLS update policy)`,
              );
            }
          }
        } catch (err) {
          console.error('[chat] failed to update context summary:', err);
        }
      },
      onError: ({ error }) => {
        console.error('[chat] streamText error:', error);
      },
    },
  );

  // Debiting inside streamText's own onFinish is too late: that callback maps
  // internally to the 'ai' package's onEnd, which only fires from the
  // eventProcessor's flush() — after the 'finish' part has already been
  // enqueued and forwarded to toUIMessageStream's messageMetadata below (read
  // node_modules/ai/dist/index.js's DefaultStreamTextResult: transform()
  // enqueues each chunk before awaiting onChunk, and flush() — which invokes
  // onEnd/onFinish — only runs once the writable side has fully closed, i.e.
  // strictly after every chunk, including 'finish', has already gone out).
  // That mismatch meant a correct debit's balance would still have shown up
  // one message late. Gating here — awaiting the debit before re-enqueueing
  // 'finish' — guarantees messageMetadata sees the post-debit balance. (A
  // separate, since-fixed bug in check_and_reserve_coins — see migration
  // 0040 — meant debits weren't actually persisting yet either; this gate is
  // still needed independently of that.)
  const stream = rawStream.pipeThrough(
    new TransformStream({
      async transform(part, controller) {
        // coinBalance === null means checkAndReserveCoins failed open — the
        // balance is unknown, so skip the debit too (fail-open bias: an infra
        // hiccup on the reserve path must not produce a debit whose displayed
        // result we can't trust).
        if (part.type === 'finish' && user && !isAdmin && coinPrice !== null && coinBalance !== null) {
          const newBalance = await debitCoins(user.id, coinPrice);
          if (newBalance !== null) coinBalance = newBalance;
        }
        // A completed chat message is the "real usage" signal that a pending
        // referral is paid on (0059 section D.2) — the bonus is no longer
        // granted at signup. Deliberately NOT awaited and never surfaced:
        // this must not delay the finish part, must not affect the balance
        // reported in messageMetadata below, and must never fail a chat
        // response. A no-op for the overwhelming majority of messages (the
        // RPC finds no pending row and returns immediately).
        if (part.type === 'finish' && user) {
          void claimPendingReferral(user.id).catch((err) => {
            console.error('[chat] pending referral credit failed:', err);
          });
        }
        controller.enqueue(part);
      },
    }),
  );

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream,
      messageMetadata: () => {
        // liveAnswerText is empty at the 'start' event (nothing streamed yet) and
        // fully populated by 'finish' (all text-delta parts have already passed
        // through onChunk) — filtering naturally yields an empty citation list
        // for the former and the real, referenced-only list for the latter.
        const citations = buildCitations(filterCitedChunks(relevantChunks, liveAnswerText));
        const conversationIdMeta = conversation?.id;
        if (isAdmin) return { citations, modelUsed, messageId: assistantMessageId, conversationId: conversationIdMeta };
        if (coinPrice !== null && coinBalance !== null) {
          return { citations, coins: { balance: coinBalance, price: coinPrice }, conversationId: conversationIdMeta };
        }
        return { citations, conversationId: conversationIdMeta };
      },
      onError: (error) => {
        // Fires only once a stream error is terminal and about to reach the client
        // (i.e. after any primary->fallback switch has already been decided) — safe
        // point to clean up the placeholder assistant message row so a fully failed
        // request doesn't leave a permanent blank bubble in history.
        if (assistantMessageId) {
          void supabase
            .from('messages')
            .delete()
            .eq('id', assistantMessageId)
            .then(({ error: delError }) => {
              if (delError) console.error('[chat] failed to clean up placeholder message:', delError);
            });
        }
        return toClientErrorMessage(error);
      },
    }),
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');

  // Deliberately NOT behind requireAdmin(): quota and conversation history are
  // ordinary authenticated-user reads, scoped by RLS to the caller's own rows.
  if (type === 'quota') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error) return serverError(error, 'Profil məlumatı alınmadı');

    if (profile.role === 'admin') {
      return Response.json({ exempt: true });
    }

    const { balance, dailyLimit, price, msUntilReset } = await getCoinBalanceStatus(user.id);

    return Response.json({
      exempt: false,
      balance,
      dailyLimit: dailyLimit ?? DEFAULT_DAILY_LIMIT,
      price,
      msUntilReset,
    });
  }

  if (type !== 'history') return apiError(400, 'type parametri düzgün deyil');

  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    // Untitled conversations are always empty (title is only ever set once
    // the first message lands — see the auto-title logic in POST above) and
    // are meant to be transient: a "+ Yeni söhbət" click that never got a
    // first message shouldn't clutter the sidebar as a ghost "Untitled"
    // entry. Excluding them here is the read-side half of that; the
    // write-side half (actually deleting them) happens below when their own
    // conversationId is fetched and found empty.
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, created_at, updated_at')
      .eq('user_id', user.id)
      .not('title', 'is', null)
      .order('updated_at', { ascending: false });

    if (error) return serverError(error, 'Söhbətlər siyahısını yükləmək uğursuz oldu');

    return Response.json({ conversations: conversations ?? [] });
  }

  // RLS (conversations_select_own) is the real enforcement layer here; the
  // .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { data: conversation, error: conversationError } = await supabase
    .from('conversations')
    .select('id, title')
    .eq('id', conversationId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (conversationError) return serverError(conversationError, 'Söhbəti yükləmək uğursuz oldu');
  if (!conversation) return notFound('Söhbət tapılmadı');

  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, role, content, citations, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) return serverError(error, 'Söhbət tarixçəsini yükləmək uğursuz oldu');

  // Unnamed conversations are always meant to be temporary — a
  // "+ Yeni söhbət" click that's never actually used (no message ever sent,
  // so title was never auto-set) shouldn't survive a page refresh as an
  // empty, permanent row. Deleting here (rather than only hiding it from the
  // list above) means visiting its URL again — the exact "create then
  // refresh" scenario — cleans it up and reports 404, which ChatClient.tsx's
  // history-load effect already treats as "start a fresh new chat"
  // (router.replace('/chat')), so no separate client-side handling is needed.
  if ((messages ?? []).length === 0) {
    await supabase.from('conversations').delete().eq('id', conversationId).eq('user_id', user.id);
    return notFound('Söhbət tapılmadı');
  }

  return Response.json({ messages, title: conversation.title });
}

// Called only from POST above, after its unconditional auth gate.
async function historyPost(request: Request, supabase: ServerSupabase, userId: string) {
  const { searchParams } = new URL(request.url);

  if (searchParams.get('action') === 'share') {
    const conversationId = searchParams.get('conversationId');
    if (!conversationId) {
      return apiError(400, 'conversationId parametri tələb olunur', { code: 'missing_conversation_id' });
    }

    const { data: existing, error: fetchError } = await supabase
      .from('conversations')
      .select('share_token')
      .eq('id', conversationId)
      .maybeSingle();

    if (fetchError) return serverError(fetchError, 'Söhbəti paylaşmaq uğursuz oldu');

    let token = existing?.share_token ?? null;

    if (!token) {
      token = randomBytes(24).toString('base64url');

      // RLS conversations_update_own (0004) scopes this to auth.uid() = user_id,
      // so this can only ever touch the caller's own conversation.
      const { error: updateError } = await supabase
        .from('conversations')
        .update({ share_token: token })
        .eq('id', conversationId)
        .eq('user_id', userId);

      if (updateError) return serverError(updateError, 'Söhbəti paylaşmaq uğursuz oldu');
    }

    return Response.json({ url: `/share/${token}` });
  }

  // Opportunistic cleanup: an untitled conversation is by definition empty
  // (title is only ever set alongside the first message) and meant to be
  // temporary. A user who repeatedly clicks "+ Yeni söhbət" without sending
  // anything would otherwise leave orphaned empty rows behind indefinitely
  // (the refresh-time cleanup in GET above only fires if that exact draft's
  // URL is revisited) — clearing them here, right before starting a fresh
  // draft, keeps at most one abandoned empty conversation alive at a time
  // instead of accumulating. Not `error`-checked since a failed cleanup
  // shouldn't block creating the new conversation.
  await supabase.from('conversations').delete().eq('user_id', userId).is('title', null);

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title: null })
    .select('id')
    .single();

  if (error) return serverError(error, 'Yeni söhbət yaratmaq uğursuz oldu');

  return Response.json({ id: created.id }, { status: 201 });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  if (new URL(request.url).searchParams.get('type') !== 'history') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const body = await request.json().catch(() => null);
  const conversationId = body?.conversationId;
  const title = body?.title;

  if (typeof conversationId !== 'string' || conversationId.trim().length === 0) {
    return apiError(400, 'conversationId tələb olunur');
  }
  if (typeof title !== 'string' || title.trim().length === 0) {
    return apiError(400, 'title boş ola bilməz');
  }
  if (title.length > 200) {
    return apiError(400, 'title 200 simvoldan uzun ola bilməz');
  }

  const trimmedTitle = title.trim();

  // RLS conversations_update_own (0004) is the real enforcement layer here
  // (same policy the share_token flow already relies on); the
  // .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { error, count } = await supabase
    .from('conversations')
    .update({ title: trimmedTitle }, { count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) return serverError(error, 'Söhbətin adını dəyişmək uğursuz oldu');
  if (!count) {
    return apiError(403, 'Söhbətin adını dəyişmək mümkün olmadı', { code: 'forbidden' });
  }

  return Response.json({ title: trimmedTitle });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return unauthorized();

  const { searchParams } = new URL(request.url);

  if (searchParams.get('type') !== 'history') {
    return apiError(400, 'type parametri düzgün deyil');
  }

  const conversationId = searchParams.get('conversationId');

  if (!conversationId) {
    return apiError(400, 'conversationId tələb olunur');
  }

  // RLS (conversations_delete_own, 0005) is the real enforcement layer here;
  // the .eq('user_id', ...) below is defense-in-depth, not a substitute for it.
  const { error, count } = await supabase
    .from('conversations')
    .delete({ count: 'exact' })
    .eq('id', conversationId)
    .eq('user_id', user.id);

  if (error) return serverError(error, 'Söhbəti silmək uğursuz oldu');
  if (!count) {
    return apiError(403, 'Söhbəti silmək mümkün olmadı', { code: 'forbidden' });
  }

  return Response.json({ deleted: true });
}
