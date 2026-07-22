import 'server-only';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { anthropic } from '@ai-sdk/anthropic';
import { deepSeek } from '@ai-sdk/deepseek';
import { google } from '@ai-sdk/google';
import type { LanguageModel } from 'ai';

// Free OpenRouter models frequently default to "reasoning" mode, which burns many
// seconds of hidden chain-of-thought tokens that our UI never renders (only
// part.type === 'text' is displayed) before any visible output streams. Disabling
// reasoning here is the one place allowed to do so, since this file owns all
// OpenRouter provider options — see chat_request_timing investigation for
// rewriteMs/llmTotalMs numbers this fixes.
const DISABLE_REASONING = { extraBody: { reasoning: { enabled: false, exclude: true } } };

// Single source of truth for the chat model id string, so getChatModel() (actual
// provider instance) and getChatModelId() (id exposed to admins via chat_request_logs
// / messageMetadata) can never drift apart.
function resolveChatModelId(): string {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  if (provider === 'anthropic') return process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5';
  if (provider === 'deepseek') return process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash';
  return process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free';
}

export function getChatModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  const modelId = resolveChatModelId();

  if (provider === 'anthropic') {
    return anthropic(modelId);
  }

  if (provider === 'deepseek') {
    return deepSeek(modelId);
  }

  return openrouter(modelId, DISABLE_REASONING);
}

export function getChatModelId(): string {
  return resolveChatModelId();
}

function resolveRewriteModelId(): string {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  if (provider === 'anthropic') return process.env.ANTHROPIC_REWRITE_MODEL ?? 'claude-haiku-4-5';
  // deepseek-v4-flash's "thinking" mode is a slow chain-of-thought mode unsuitable
  // here (same failure mode this fallback exists to avoid), so the non-thinking
  // deepseek-v4-flash default is also used for rewrite. deepseek-chat/-reasoner
  // (the old model ids) are deprecated 2026-07-24 in favor of v4-flash/v4-pro.
  if (provider === 'deepseek') return process.env.DEEPSEEK_REWRITE_MODEL ?? 'deepseek-v4-flash';
  return process.env.OPENROUTER_REWRITE_MODEL ?? 'nvidia/nemotron-3-nano-30b-a3b:free';
}

// Small/cheap model for internal steps (query rewriting) — deliberately not the
// main chat model, which may be a slow "reasoning" model unsuitable for this task.
export function getRewriteModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  const modelId = resolveRewriteModelId();

  if (provider === 'anthropic') {
    return anthropic(modelId);
  }

  if (provider === 'deepseek') {
    return deepSeek(modelId);
  }

  return openrouter(modelId, DISABLE_REASONING);
}

export function getRewriteModelId(): string {
  return resolveRewriteModelId();
}

// OpenRouter's free-tier daily limit is account-wide, shared across every `:free`
// model — switching to another OpenRouter model (even OpenRouter's own Gemini)
// doesn't help. These return a *separate*, independently-quota'd provider (Google's
// own Gemini API) to fall back to, and only when there's actually a fallback path
// configured: `LLM_PROVIDER=anthropic` (production) and missing-key dev setups both
// get `null`, which callers treat as "no fallback, use primary as-is".
function resolveChatModelFallbackId(): string | null {
  if ((process.env.LLM_PROVIDER ?? 'openrouter') !== 'openrouter') return null;
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  return process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash';
}

export function getChatModelFallback(): LanguageModel | null {
  const modelId = resolveChatModelFallbackId();
  return modelId ? google(modelId) : null;
}

export function getChatModelFallbackId(): string | null {
  return resolveChatModelFallbackId();
}

function resolveRewriteModelFallbackId(): string | null {
  if ((process.env.LLM_PROVIDER ?? 'openrouter') !== 'openrouter') return null;
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  return process.env.GOOGLE_REWRITE_MODEL ?? 'gemini-2.5-flash-lite';
}

export function getRewriteModelFallback(): LanguageModel | null {
  const modelId = resolveRewriteModelFallbackId();
  return modelId ? google(modelId) : null;
}

export function getRewriteModelFallbackId(): string | null {
  return resolveRewriteModelFallbackId();
}

// Vision resolves independently of the text-chat provider choice (LLM_PROVIDER),
// not as a variant of getChatModel()/getChatModelFallback() — a deployment can run
// deepseek (no vision support) for everyday chat while still having a
// GOOGLE_GENERATIVE_AI_API_KEY configured, and vision should work in that case.
// Only gated on GOOGLE_GENERATIVE_AI_API_KEY being present, unlike
// resolveChatModelFallbackId()/resolveRewriteModelFallbackId() above, which are
// additionally gated on LLM_PROVIDER === 'openrouter' (those exist to route around
// OpenRouter's account-wide free-tier limit specifically, a different concern).
function resolveVisionModelFallbackId(): string | null {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;
  return process.env.GOOGLE_VISION_MODEL ?? process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash';
}

// Anthropic Claude and Google Gemini both support vision; DeepSeek and the
// OpenRouter free-tier default model do not. Anthropic branch reuses
// resolveChatModelId() (rather than a second hardcoded model id string) since
// that function already resolves the correct Anthropic model id whenever
// LLM_PROVIDER === 'anthropic' — it must only be called inside that branch here,
// since outside it resolveChatModelId() would resolve a different provider's id.
export function getVisionModel(): LanguageModel | null {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  if (provider === 'anthropic') {
    return anthropic(resolveChatModelId());
  }

  const modelId = resolveVisionModelFallbackId();
  return modelId ? google(modelId) : null;
}

// Cheap/sync (no network call) by design — called both as a server-side route
// guard and passed down as a prop to the /chat page on every load to decide
// whether to show the image-attach UI at all.
export function isVisionAvailable(): boolean {
  return getVisionModel() !== null;
}

// Whether the model getChatModel() returns can accept image content parts.
// Distinct from isVisionAvailable(), which answers "can this deployment look at
// a photo AT ALL" — that one is satisfied by the separate Gemini vision model
// used for the identification step, and says nothing about the model that
// writes the final answer. Callers must strip file parts from the messages they
// hand to getChatModel() when this is false: DeepSeek (the current default) and
// the OpenRouter free-tier text models reject an image part outright, which
// surfaced as an intermittent "Cavab alınmadı" in chat whenever a photo was
// attached.
export function chatModelSupportsVision(): boolean {
  return (process.env.LLM_PROVIDER ?? 'openrouter') === 'anthropic';
}

// deepseek-v4-flash defaults to 'adaptive' thinking, i.e. it may silently emit
// hidden chain-of-thought tokens before any visible output — the same failure
// mode DISABLE_REASONING exists to prevent for OpenRouter models, just gated
// through generateText/streamText's `providerOptions` instead of provider
// factory settings, since @ai-sdk/deepseek exposes `thinking` as a per-call
// chat option, not a DeepSeekProviderSettings field. providerOptions keyed by
// a provider name other than the active model's are ignored, so it's safe to
// always include this regardless of which provider is active.
export function getProviderCallOptions() {
  return { deepseek: { thinking: { type: 'disabled' as const } } };
}
