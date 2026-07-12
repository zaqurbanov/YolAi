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
import { retrieveRelevantChunks } from '@/lib/retrieval/search';
import { buildSystemPrompt, buildContextBlock, buildCitations } from '@/lib/rag/buildPrompt';
import { shouldUpdateSummary, updateContextSummary } from '@/lib/rag/contextSummary';
import { rewriteQuery } from '@/lib/rag/rewriteQuery';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { apiError, serverError } from '@/lib/api/errors';

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
  // cookie check and is never sufficient authorization on its own. Kicked off now so
  // it runs concurrently with retrieval/rewrite instead of blocking the hot path.
  const isAdminPromise: Promise<boolean> = user
    ? Promise.resolve(
        supabase.from('profiles').select('role').eq('id', user.id).single(),
      ).then(({ data }) => data?.role === 'admin')
    : Promise.resolve(false);

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

  const { chunks: relevantChunks, embedMs, dbSearchMs } = await retrieveRelevantChunks({
    embedQuery: retrievalQuery,
    ftsQuery: query,
    documentId,
  });

  const contextBlock = buildContextBlock(relevantChunks);
  const citations = buildCitations(relevantChunks);

  const summaryBlock = conversation && Object.keys(conversation.contextSummary).length > 0
    ? `\n\nSÖHBƏTİN XÜLASƏSİ (əvvəlki mesajlardan qısa yaddaş, yalnız kontekst üçündür, faktları yenidən sitat gətirmə mənbəyi kimi istifadə etmə):\n${JSON.stringify(conversation.contextSummary)}`
    : '';

  const windowedMessages = messages.slice(-MESSAGE_WINDOW);

  const llmStartTime = performance.now();
  let llmFirstTokenMs: number | null = null;

  const fallbackModel = getChatModelFallback();
  const fallbackModelId = getChatModelFallbackId();

  const { stream, usedFallback, modelUsed } = await streamTextWithFallback(
    { model: getChatModel(), modelId: getChatModelId() },
    fallbackModel && fallbackModelId ? { model: fallbackModel, modelId: fallbackModelId } : null,
    {
      system: `${buildSystemPrompt(userName)}\n\nKONTEKST:\n${contextBlock || 'Heç bir uyğun məlumat tapılmadı.'}${summaryBlock}`,
      messages: await convertToModelMessages(windowedMessages),
      providerOptions: getProviderCallOptions(),
      onChunk: () => {
        if (llmFirstTokenMs === null) {
          llmFirstTokenMs = performance.now() - llmStartTime;
        }
      },
      onFinish: async ({ text }) => {
        const llmTotalMs = performance.now() - llmStartTime;

        try {
          console.log(
            JSON.stringify({
              event: 'chat_request_timing',
              requestId,
              usedFallback,
              rewriteMs,
              embedMs,
              dbSearchMs,
              llmFirstTokenMs,
              llmTotalMs,
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
            llm_first_token_ms: llmFirstTokenMs,
            llm_total_ms: llmTotalMs,
            used_fallback: usedFallback,
            model_used: modelUsed,
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

  const isAdmin = await isAdminPromise;

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream,
      messageMetadata: () =>
        isAdmin ? { citations, modelUsed, messageId: assistantMessageId } : { citations },
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
