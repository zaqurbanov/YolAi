import {
  convertToModelMessages,
  toUIMessageStream,
  createUIMessageStreamResponse,
  APICallError,
  RetryError,
  type UIMessage,
} from 'ai';
import { getChatModel, getChatModelFallback, getChatModelId, getChatModelFallbackId, getProviderCallOptions } from '@/lib/llm';
import { streamTextWithFallback } from '@/lib/llm/streamWithFallback';
import { retrieveRelevantChunks, retrievePerDocumentChunks, retrieveChunksByArticle, type RetrievedChunk } from '@/lib/retrieval/search';
import { extractArticleReferences, articleLabelPrefixes, isPureArticleReferenceQuery } from '@/lib/retrieval/articleQuery';
import { buildSystemPrompt, buildContextBlock, buildCitations, filterCitedChunks } from '@/lib/rag/buildPrompt';
import { shouldUpdateSummary, updateContextSummary } from '@/lib/rag/contextSummary';
import { rewriteQuery } from '@/lib/rag/rewriteQuery';
import { rerankChunks } from '@/lib/rag/rerank';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, serverError } from '@/lib/api/errors';
import { checkChatRateLimit } from '@/lib/chat/rateLimit';
import { checkAndReserveCoins, debitCoins } from '@/lib/chat/coins';

const MESSAGE_WINDOW = 10;

export const maxDuration = 60;

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
}

async function getOrCreateConversation(userId: string): Promise<ConversationState> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from('conversations')
    .select('id, context_summary, summary_message_count')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return {
      id: existing.id,
      contextSummary: existing.context_summary ?? {},
      summaryMessageCount: existing.summary_message_count ?? 0,
    };
  }

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId })
    .select('id, context_summary, summary_message_count')
    .single();

  if (error) throw error;
  return {
    id: created.id,
    contextSummary: created.context_summary ?? {},
    summaryMessageCount: created.summary_message_count ?? 0,
  };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  let messages: UIMessage[];
  let documentId: string | undefined;
  try {
    ({ messages, documentId } = await request.json());
  } catch (err) {
    return apiError(400, 'Yanlış sorğu formatı', { cause: err });
  }

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  const query = lastUserMessage?.parts?.map((p) => ('text' in p ? p.text : '')).join(' ') ?? '';

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userName =
    user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? (user?.email ? user.email.split('@')[0] : null) ?? null;

  // Real server-side admin check (profiles.role) — proxy.ts only does an optimistic
  // cookie check and is never sufficient authorization on its own. Awaited immediately
  // (rather than kicked off to run concurrently with retrieval/rewrite, as before) so
  // the per-user rate limit check right below can gate a non-admin request before any
  // expensive work (retrieval, embedding, LLM call) starts — a rejected request must
  // cost nothing beyond this one indexed `profiles` PK lookup.
  const profilePromise: Promise<{ role: string | null; custom_max_per_day: number | null } | undefined> = user
    ? Promise.resolve(
        supabase.from('profiles').select('role, custom_max_per_day').eq('id', user.id).single(),
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
      conversation = await getOrCreateConversation(user.id);
      await supabase.from('messages').insert({
        conversation_id: conversation.id,
        role: 'user',
        content: query,
      });

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
    } catch (err) {
      return serverError(err, 'Söhbəti yaratmaq uğursuz oldu');
    }
  }

  const rewriteStart = performance.now();
  const retrievalQuery = await rewriteQuery(query, conversation?.contextSummary);
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
  const rawQueryDiffersFromRewrite = retrievalQuery !== query;

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
  const articleRefs = extractArticleReferences(query);
  const articlePrefixes = articleLabelPrefixes(articleRefs);
  const skipTrigram = isPureArticleReferenceQuery(query, articleRefs);
  const ftsQueryForSearch = skipTrigram ? undefined : query;

  const [primaryResult, rawQueryResult, perDocumentResult, articleResult] = await Promise.all([
    retrieveRelevantChunks({ embedQuery: retrievalQuery, ftsQuery: ftsQueryForSearch, documentId }),
    rawQueryDiffersFromRewrite
      ? retrieveRelevantChunks({ embedQuery: query, ftsQuery: ftsQueryForSearch, documentId })
      : null,
    documentId ? null : retrievePerDocumentChunks(retrievalQuery, ftsQueryForSearch),
    articlePrefixes.length > 0 ? retrieveChunksByArticle(retrievalQuery, articlePrefixes) : null,
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

  const embedMs =
    primaryResult.embedMs + (rawQueryResult?.embedMs ?? 0) + (perDocumentResult?.embedMs ?? 0) + (articleResult?.embedMs ?? 0);
  const dbSearchMs =
    primaryResult.dbSearchMs +
    (rawQueryResult?.dbSearchMs ?? 0) +
    (perDocumentResult?.dbSearchMs ?? 0) +
    (articleResult?.dbSearchMs ?? 0);

  const { keptIds, rerankMs } = await rerankChunks(query, initialChunks);
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

  const { stream, usedFallback, modelUsed } = await streamTextWithFallback(
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
        // Coins are spent only here — a fully successful stream — never on
        // error/abort (see onError below and toUIMessageStream's own onError,
        // neither of which call debitCoins). This callback runs before the
        // 'finish' UI message part reaches messageMetadata below (see the
        // assistantMessageId comment above for the same ai@7.0.16 timing
        // guarantee this relies on), so the debited balance is available in
        // time for the client's final metadata payload.
        if (user && !isAdmin && coinPrice !== null) {
          const newBalance = await debitCoins(user.id, coinPrice);
          if (newBalance !== null) coinBalance = newBalance;
        }

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

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream,
      messageMetadata: () => {
        // liveAnswerText is empty at the 'start' event (nothing streamed yet) and
        // fully populated by 'finish' (all text-delta parts have already passed
        // through onChunk) — filtering naturally yields an empty citation list
        // for the former and the real, referenced-only list for the latter.
        const citations = buildCitations(filterCitedChunks(relevantChunks, liveAnswerText));
        if (isAdmin) return { citations, modelUsed, messageId: assistantMessageId };
        if (coinPrice !== null && coinBalance !== null) {
          return { citations, coins: { balance: coinBalance, price: coinPrice } };
        }
        return { citations };
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
