import 'server-only';
import { generateText, APICallError, RetryError, type LanguageModel } from 'ai';

// Same unwrap logic as `toClientErrorMessage` in app/api/chat/route.ts — kept in
// one place so the "what counts as a provider failure worth falling back on"
// definition can't drift between the two call sites.
export function isFallbackTrigger(error: unknown): boolean {
  const cause = RetryError.isInstance(error) ? error.lastError : error;
  return APICallError.isInstance(cause) || RetryError.isInstance(error);
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type GenerateTextParams = DistributiveOmit<Parameters<typeof generateText>[0], 'model'>;

export async function generateTextWithFallback(
  primaryModel: LanguageModel,
  fallbackModel: LanguageModel | null,
  params: GenerateTextParams,
) {
  try {
    return await generateText({ model: primaryModel, ...params });
  } catch (error) {
    if (fallbackModel && isFallbackTrigger(error)) {
      return await generateText({ model: fallbackModel, ...params });
    }
    throw error;
  }
}
