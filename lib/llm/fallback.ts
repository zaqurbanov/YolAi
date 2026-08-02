import 'server-only';
import { generateObject, generateText, APICallError, RetryError, type FlexibleSchema } from 'ai';
import type { ModelSlot } from './index';
import { logError } from '@/lib/logging/logError';

// Same unwrap logic as `toClientErrorMessage` in app/api/chat/route.ts — kept in
// one place so the "what counts as a provider failure worth falling back on"
// definition can't drift between the two call sites.
export function isFallbackTrigger(error: unknown): boolean {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(cause) || RetryError.isInstance(error);
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type GenerateTextParams = DistributiveOmit<Parameters<typeof generateText>[0], 'model'>;

// Tries each model slot in order; advances to the next on any isFallbackTrigger
// error (quota/429/outage), so with LLM_ROUTING=gemini-first a request rides
// gemini g1 → gemini g2 → the LLM_PROVIDER primary. The final slot's error is
// rethrown unchanged — a genuinely exhausted chain must surface, not be swallowed.
export async function generateTextWithRouting(
  slots: ModelSlot[],
  params: GenerateTextParams,
) {
  if (slots.length === 0) {
    throw new Error('generateTextWithRouting: no model slots configured');
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    try {
      return await generateText({
        model: slot.model,
        ...params,
        // Slot-scoped providerOptions (e.g. disabling Qwen3 reasoning on Groq)
        // win over the call-site ones — a slot's constraint is more specific.
        providerOptions: { ...params.providerOptions, ...slot.providerOptions },
      });
    } catch (error) {
      if (i < slots.length - 1 && isFallbackTrigger(error)) {
        // The request still succeeds via the next slot, so nothing surfaces to
        // the caller — but a provider failure (quota, 429, outage) is exactly
        // what should be visible in the logs dashboard rather than only
        // inferable from latency.
        void logError('llm.fallback.generateText', error, {
          details: { fromModel: slot.modelId, toModel: slots[i + 1].modelId },
        });
        continue;
      }
      throw error;
    }
  }

  throw new Error('generateTextWithRouting: exhausted model slots (unreachable)');
}

// generateObject mirrors generateText's model slot but is generic over the
// schema it parses. The schema is passed as its own argument (not buried inside
// a Parameters<typeof generateObject<SCHEMA>> union) so TS infers SCHEMA to the
// concrete zod type and the caller keeps the schema-inferred object type. Same
// try-each-slot semantics as generateTextWithRouting.
export async function generateObjectWithRouting<SCHEMA extends FlexibleSchema<unknown>>(
  slots: ModelSlot[],
  schema: SCHEMA,
  params: Omit<Parameters<typeof generateObject<SCHEMA>>[0], 'model' | 'schema'>,
): Promise<Awaited<ReturnType<typeof generateObject<SCHEMA>>>> {
  if (slots.length === 0) {
    throw new Error('generateObjectWithRouting: no model slots configured');
  }

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    try {
      // Omit over generateObject's options collapses its `output` discriminator
      // branches (object/enum/array), so re-assembling {model, schema, ...params}
      // can't re-prove branch identity — cast back to the union's head. Field
      // checking still happens at the call sites via the derived params type.
      const options = {
        model: slot.model,
        schema,
        ...params,
        // Same slot-wins merge as generateTextWithRouting.
        providerOptions: { ...params.providerOptions, ...slot.providerOptions },
      } as unknown as Parameters<typeof generateObject<SCHEMA>>[0];
      return await generateObject(options);
    } catch (error) {
      if (i < slots.length - 1 && isFallbackTrigger(error)) {
        // Same rationale as generateTextWithRouting — provider failure (quota,
        // 429, outage) is observable in the logs dashboard, invisible to the
        // lesson-generation caller (the next slot answers).
        void logError('llm.fallback.generateObject', error, {
          details: { fromModel: slot.modelId, toModel: slots[i + 1].modelId },
        });
        continue;
      }
      throw error;
    }
  }

  throw new Error('generateObjectWithRouting: exhausted model slots (unreachable)');
}
