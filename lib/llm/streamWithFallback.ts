import 'server-only';
import { streamText, type TextStreamPart, type ToolSet } from 'ai';
import { isFallbackTrigger } from './fallback';
import type { ModelSlot } from './index';
import { logError } from '@/lib/logging/logError';

// No caller in this codebase passes `tools` to streamText — keep this untyped over
// TOOLS to avoid fighting streamText's tool-context-dependent conditional types for
// a capability nothing here uses.
type EmptyToolSet = Record<string, never>;
type StreamPart = TextStreamPart<EmptyToolSet>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type StreamTextParams = DistributiveOmit<Parameters<typeof streamText<ToolSet>>[0], 'model' | 'tools'>;

export interface StreamTextWithRoutingResult {
  stream: ReadableStream<StreamPart>;
  usedFallback: boolean;
  modelUsed: string;
}

// streamText() never throws for provider errors (429, 5xx, timeouts) — they only
// surface asynchronously as a `{ type: 'error' }` part inside `result.stream`, after
// the stream has already been handed back to the caller. To fall back before any
// content reaches the client, we read past the always-present synchronous `start`
// part to the next ("decision") part: if that's an error matching isFallbackTrigger
// AND a later slot exists, we discard this attempt and start over on the next slot;
// otherwise we splice the peeked parts back onto the front of the stream and pass
// the rest through untouched, so nothing is lost and no extra latency is added for
// the common (first-slot-succeeds) case.
//
// Slots are ordered by preference (LLM_ROUTING=gemini-first → [groq, mistral,
// gemini, LLM_PROVIDER primary, nvidia]); the first slot that yields a
// non-error decision chunk wins.
export async function streamTextWithRouting(
  slots: ModelSlot[],
  params: StreamTextParams,
): Promise<StreamTextWithRoutingResult> {
  if (slots.length === 0) {
    throw new Error('streamTextWithRouting: no model slots configured');
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const isLast = i === slots.length - 1;
    const slotResult = streamText({
      model: slot.model,
      ...params,
      // Slot-scoped providerOptions (e.g. disabling Qwen3 reasoning on Groq)
      // win over the call-site ones — a slot's constraint is more specific.
      providerOptions: { ...params.providerOptions, ...slot.providerOptions },
    });
    const reader = slotResult.stream.getReader() as ReadableStreamDefaultReader<StreamPart>;

    const buffered: StreamPart[] = [];
    let decisionChunk: StreamPart | null = null;
    let readerDone = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        readerDone = true;
        break;
      }
      buffered.push(value);
      if (value.type !== 'start') {
        decisionChunk = value;
        break;
      }
    }

    if (decisionChunk?.type === 'error' && !isLast && isFallbackTrigger(decisionChunk.error)) {
      reader.cancel().catch(() => {});
      // Invisible to the user (the next slot answers) and invisible to
      // chat.stream's onError (that only fires on a terminal failure) — logged
      // here so provider outages/quota exhaustion are still observable.
      void logError('llm.fallback.stream', decisionChunk.error, {
        details: { fromModel: slot.modelId, toModel: slots[i + 1].modelId },
      });
      continue;
    }

    const rebuiltStream = new ReadableStream<StreamPart>({
      start(controller) {
        for (const chunk of buffered) controller.enqueue(chunk);
        if (readerDone) {
          controller.close();
          return;
        }
        (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                controller.close();
                return;
              }
              controller.enqueue(value);
            }
          } catch (err) {
            void logError('llm.stream.readFailed', err, { details: { model: slot.modelId } });
            controller.error(err);
          }
        })();
      },
      cancel(reason) {
        reader.cancel(reason).catch(() => {});
      },
    });

    return { stream: rebuiltStream, usedFallback: i > 0, modelUsed: slot.modelId };
  }

  throw new Error('streamTextWithRouting: exhausted model slots (unreachable)');
}
