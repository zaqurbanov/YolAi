import 'server-only';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { anthropic } from '@ai-sdk/anthropic';
import { deepSeek } from '@ai-sdk/deepseek';
import { createGoogle, google } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { ProviderOptions } from '@ai-sdk/provider-utils';
import type { LanguageModel } from 'ai';

// A resolved provider instance plus the id string exposed for observability
// (chat_request_logs.model_used / messageMetadata). Lives here so both the
// routing-chain builders below and the fallback machinery can share it.
export interface ModelSlot {
  model: LanguageModel;
  modelId: string;
  /**
   * Provider-scoped options that must apply to THIS slot specifically — merged
   * over the call-site providerOptions in the routing functions, so a slot's
   * constraint wins on key collision. Kept on the slot (not in
   * getProviderCallOptions) because options valid for one model are invalid
   * for another: Groq's llama models reject ANY reasoning parameter with
   * HTTP 400, while qwen3 requires one to keep its thinking out of `content`.
   */
  providerOptions?: ProviderOptions;
}

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

// ---- Routing chains (LLM_ROUTING=gemini-first) -----------------------------
//
// The chat/rewrite model is no longer a single "primary + one fallback" pair:
// with `LLM_ROUTING=gemini-first` the daily-reset free tiers are tried first —
// Groq (both keys), then Mistral (one key), then the free Gemini keys (g1 → g2) —
// then the LLM_PROVIDER primary (deepseek/anthropic/openrouter) — and NVIDIA NIM
// last, the no-daily-cap insurance tier that answers even when the paid primary
// is down. When the flag is unset, the chain degrades to exactly the historical
// pairing [primary, (openrouter-only) gemini1], so existing deployments keep
// their behavior.
//
// One Gemini key = one independently-quota'd model instance (@ai-sdk/google's
// google() factory takes a per-instance apiKey). The `:g1`/`:g2` suffix on
// modelId is for observability only — the provider model id is identical for
// both keys, so without it you can't tell which key answered from the logs.
function routingEnabled(): boolean {
  return process.env.LLM_ROUTING === 'gemini-first';
}

// @ai-sdk/google's `google` instance is bound to GOOGLE_GENERATIVE_AI_API_KEY at
// import time, so a second key needs its own provider instance via createGoogle().
function geminiSlot(modelId: string, apiKey: string | undefined, label: 'g1' | 'g2'): ModelSlot | null {
  if (!apiKey) return null;
  return { model: createGoogle({ apiKey })(modelId), modelId: `${modelId}:${label}` };
}

// Groq free tier (30 RPM / 1K RPD per model, daily reset — the same
// "limit refreshəsi hər gün" behavior the Gemini keys have). Two independent
// keys = two independently-quota'd model instances (one per Groq account), the
// same two-slot pattern the Gemini keys use. The `:groq1`/`:groq2` suffix on
// modelId keeps WHICH key answered visible in chat_request_logs.model_used
// (both keys serve the same model id, so without it they'd be indistinguishable).
// Groq's Qwen3 models reason by default and stream that reasoning INSIDE
// `content` (verified live: a raw <think>…</think> block landed in the chat UI).
// `reasoningEffort: 'none'` turns the thinking OFF — the model answers directly
// with ~zero reasoning tokens. `reasoningFormat: 'hidden'` alone does NOT stop
// the thinking, it only hides it (the model still burns its whole token budget).
// Applied ONLY to the chat slots (qwen) — the rewrite slots (llama) must not
// receive any reasoning parameter (Groq rejects it with 400).
const GROQ_REASONING_OFF: ProviderOptions = {
  groq: { reasoningEffort: 'none', reasoningFormat: 'hidden' },
};

function groqSlot(
  modelId: string,
  apiKey: string | undefined,
  label: 'groq1' | 'groq2',
  providerOptions?: ProviderOptions
): ModelSlot | null {
  if (!apiKey) return null;
  return { model: createGroq({ apiKey })(modelId), modelId: `${modelId}:${label}`, providerOptions };
}

// NVIDIA NIM (build.nvidia.com) — ~40 RPM, NO daily cap (throttles rather than
// exhausts), no card. There's no @ai-sdk/nvidia package, so it rides the
// OpenAI-compatible provider pointed at NVIDIA's integrate endpoint. Slower than
// the other free tiers (~35 tok/s), so it sits LAST in the chain — after the paid
// primary — as the insurance tier that never runs out. Default
// meta/llama-3.3-70b-instruct is non-reasoning — a reasoning model here (e.g.
// deepseek-r1) would leak its thinking the same way Groq's Qwen3 did.
function nvidiaSlot(modelId: string, apiKey: string | undefined): ModelSlot | null {
  if (!apiKey) return null;
  return {
    model: createOpenAICompatible({
      name: 'nvidia',
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey,
    })(modelId),
    modelId: `${modelId}:nvidia`,
  };
}

// Mistral La Plateforme (console.mistral.ai) — free Experiment plan, ~1B tokens/month,
// no card. Non-reasoning mistral-small-latest by default, single slot (one key).
function mistralSlot(modelId: string, apiKey: string | undefined): ModelSlot | null {
  if (!apiKey) return null;
  return { model: createMistral({ apiKey })(modelId), modelId: `${modelId}:mistral` };
}

export function getChatModelChain(): ModelSlot[] {
  const primary: ModelSlot = { model: getChatModel(), modelId: getChatModelId() };

  if (!routingEnabled()) {
    const fallback = getChatModelFallback();
    const fallbackId = getChatModelFallbackId();
    return fallback && fallbackId ? [primary, { model: fallback, modelId: fallbackId }] : [primary];
  }

  const chain: ModelSlot[] = [];
  const groq1 = groqSlot(
    process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b',
    process.env.GROQ_API_KEY,
    'groq1',
    GROQ_REASONING_OFF
  );
  const groq2 = groqSlot(
    process.env.GROQ_MODEL ?? 'qwen/qwen3.6-27b',
    process.env.GROQ_API_KEY_2,
    'groq2',
    GROQ_REASONING_OFF
  );
  if (groq1) chain.push(groq1);
  if (groq2) chain.push(groq2);
  const mistral = mistralSlot(
    process.env.MISTRAL_MODEL ?? 'mistral-small-latest',
    process.env.MISTRAL_API_KEY
  );
  if (mistral) chain.push(mistral);
  const modelId = process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash';
  const g1 = geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'g1');
  const g2 = geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY_2, 'g2');
  if (g1) chain.push(g1);
  if (g2) chain.push(g2);
  // Paid primary is next-to-last. NVIDIA is deliberately LAST: it has no daily cap
  // (throttles rather than exhausts) and is slow (~35 tok/s), so it's the insurance
  // tier — when even the paid primary is down/exhausted, this free slot still
  // answers. Nothing sits after it.
  chain.push(primary);
  const nvidia = nvidiaSlot(
    process.env.NVIDIA_MODEL ?? 'meta/llama-3.3-70b-instruct',
    process.env.NVIDIA_API_KEY
  );
  if (nvidia) chain.push(nvidia);
  return chain;
}

export function getRewriteModelChain(): ModelSlot[] {
  const primary: ModelSlot = { model: getRewriteModel(), modelId: getRewriteModelId() };

  if (!routingEnabled()) {
    const fallback = getRewriteModelFallback();
    const fallbackId = getRewriteModelFallbackId();
    return fallback && fallbackId ? [primary, { model: fallback, modelId: fallbackId }] : [primary];
  }

  const chain: ModelSlot[] = [];
  const groq1 = groqSlot(
    process.env.GROQ_REWRITE_MODEL ?? 'llama-3.3-70b-versatile',
    process.env.GROQ_API_KEY,
    'groq1'
  );
  const groq2 = groqSlot(
    process.env.GROQ_REWRITE_MODEL ?? 'llama-3.3-70b-versatile',
    process.env.GROQ_API_KEY_2,
    'groq2'
  );
  if (groq1) chain.push(groq1);
  if (groq2) chain.push(groq2);
  const mistral = mistralSlot(
    process.env.MISTRAL_REWRITE_MODEL ?? 'mistral-small-latest',
    process.env.MISTRAL_API_KEY
  );
  if (mistral) chain.push(mistral);
  const modelId = process.env.GOOGLE_REWRITE_MODEL ?? 'gemini-2.5-flash-lite';
  const g1 = geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'g1');
  const g2 = geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY_2, 'g2');
  if (g1) chain.push(g1);
  if (g2) chain.push(g2);
  // Same deliberate order as chat: paid primary next-to-last, NVIDIA last
  // (no daily cap, slow — insurance tier).
  chain.push(primary);
  const nvidia = nvidiaSlot(
    process.env.NVIDIA_REWRITE_MODEL ?? 'meta/llama-3.3-70b-instruct',
    process.env.NVIDIA_API_KEY
  );
  if (nvidia) chain.push(nvidia);
  return chain;
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
// chat option, not a DeepSeekProviderSettings field. (Groq's Qwen3 reasoning
// leak is handled per-slot via ModelSlot.providerOptions / GROQ_REASONING_OFF,
// not here — see the comment at groqSlot.) providerOptions keyed by a provider
// name other than the active model's are ignored, so it's safe to always
// include this regardless of which provider is active.
export function getProviderCallOptions() {
  return { deepseek: { thinking: { type: 'disabled' as const } } };
}
