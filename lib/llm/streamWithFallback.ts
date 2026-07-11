import 'server-only';
import { streamText, type LanguageModel, type TextStreamPart, type ToolSet } from 'ai';
import { isFallbackTrigger } from './fallback';

// No caller in this codebase passes `tools` to streamText — keep this untyped over
// TOOLS to avoid fighting streamText's tool-context-dependent conditional types for
// a capability nothing here uses.
type EmptyToolSet = Record<string, never>;
type StreamPart = TextStreamPart<EmptyToolSet>;
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type StreamTextParams = DistributiveOmit<Parameters<typeof streamText<ToolSet>>[0], 'model' | 'tools'>;

export interface ModelSlot {
  model: LanguageModel;
  modelId: string;
}

export interface StreamTextWithFallbackResult {
  stream: ReadableStream<StreamPart>;
  usedFallback: boolean;
  modelUsed: string;
}

// streamText() never throws for provider errors (429, 5xx, timeouts) — they only
// surface asynchronously as a `{ type: 'error' }` part inside `result.stream`, after
// the stream has already been handed back to the caller. To fall back before any
// content reaches the client, we read past the always-present synchronous `start`
// part to the next ("decision") part: if that's an error matching isFallbackTrigger,
// we discard the primary attempt and start over on the fallback model; otherwise we
// splice the peeked parts back onto the front of the stream and pass the rest through
// untouched, so nothing is lost and no extra latency is added for the common case.
export async function streamTextWithFallback(
  primary: ModelSlot,
  fallback: ModelSlot | null,
  params: StreamTextParams,
): Promise<StreamTextWithFallbackResult> {
  const primaryResult = streamText({ model: primary.model, ...params });
  const reader = primaryResult.stream.getReader() as ReadableStreamDefaultReader<StreamPart>;

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

  if (decisionChunk?.type === 'error' && fallback && isFallbackTrigger(decisionChunk.error)) {
    reader.cancel().catch(() => {});
    const fallbackResult = streamText({ model: fallback.model, ...params });
    return {
      stream: fallbackResult.stream as unknown as ReadableStream<StreamPart>,
      usedFallback: true,
      modelUsed: fallback.modelId,
    };
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
          controller.error(err);
        }
      })();
    },
    cancel(reason) {
      reader.cancel(reason).catch(() => {});
    },
  });

  return { stream: rebuiltStream, usedFallback: false, modelUsed: primary.modelId };
}
