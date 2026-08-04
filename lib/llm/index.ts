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

// Course reading material (lib/lessons/generateTopicContent.ts) gets its OWN
// chain, deliberately pinned to Gemini rather than following LLM_PROVIDER.
//
// WHY THIS IS SPLIT OFF FROM getChatModelChain(). The lesson text is long-form
// Azerbaijani PROSE that learners read end to end, and Azerbaijani is a
// low-resource language: model choice shows up directly in how varied and
// natural the output reads. The app's chat provider is currently DeepSeek,
// which is strongest at code/math/EN/ZH and noticeably more formulaic in
// Azerbaijani — it kept opening every single generated lesson with the same
// sentence even after the prompt was rewritten to forbid it. Chat answers are
// short and retrieval-grounded, so they tolerate that; a 1500-word lesson does
// not. Switching LLM_PROVIDER globally was not an option — that would move the
// chat surface too, which the owner wants left on its current provider.
//
// The normal chat chain is appended as the tail fallback, so a missing Google
// key or an exhausted Gemini quota degrades to "generated by whatever the app
// normally uses" instead of failing the admin's generation run outright.
//
// GOOGLE_LESSON_MODEL should NOT be pointed at a `-lite` tier model: prose
// quality is the entire reason this chain exists, and the lite tiers are the
// ones that produced the repetition in the first place.
//
// The default is a 3.x id on purpose. gemini-2.5-* returns 404 "no longer
// available to new users" on newly-created Google accounts (see the note above
// GOOGLE_MODEL in .env.local.example), so a 2.5 default would silently push
// every lesson generation onto the tail fallback — i.e. straight back to the
// provider this chain exists to avoid.
export function getLessonContentModelChain(): ModelSlot[] {
  const modelId = process.env.GOOGLE_LESSON_MODEL ?? 'gemini-3.5-flash';
  const gemini = [
    geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'g1'),
    geminiSlot(modelId, process.env.GOOGLE_GENERATIVE_AI_API_KEY_2, 'g2'),
  ].filter((slot): slot is ModelSlot => slot !== null);

  return gemini.length > 0 ? [...gemini, ...getChatModelChain()] : getChatModelChain();
}

/** First slot's id — for error messages, matching getChatModelId()'s role. */
export function getLessonContentModelId(): string {
  return getLessonContentModelChain()[0]?.modelId ?? getChatModelId();
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

// VISION CHAIN — the image-identification call (lib/rag/identifySignFromImage.ts)
// rides this, not the single getVisionModel() above.
//
// WHY IT EXISTS. Vision was the ONLY LLM path in this app without a fallback
// chain: one model, one API key. On 2026-08-04 Google returned 503 "this model
// is currently experiencing high demand" for gemini-3.5-flash three times in a
// row; identification threw, and app/api/chat/route.ts fell back to retrieving
// on the user's bare caption. The user saw a confident, completely unrelated
// answer to their photo (error_logs: context 'chat.identifySign'). One 503 must
// not be able to do that again.
//
// MEMBERSHIP IS MEASURED, NOT ASSUMED. Every candidate below was tested live
// against four visually distinct sign images (piyada keçidi / sürət həddi /
// yol ver / yanacaqdoldurma) before being included:
//
//   gemini-3.1-flash-lite   4/4 correct, ~0.7s   -> primary
//   gemini-3.5-flash        4/4 correct, ~10-13s -> kept, but demoted: it is
//                                                   15x slower and this call
//                                                   sits BEFORE rewrite,
//                                                   retrieval and the answer
//                                                   inside a 60s maxDuration
//   qwen/qwen3.6-27b (groq) correct, fast, but reasons out loud unless
//                           GROQ_REASONING_OFF is applied (it is, per slot)
//   pixtral-12b (mistral)   4/4 correct, ~0.4s, but answered in TURKISH
//                           ("yaya geçidi", "yakıt istasyonu") on a bare
//                           prompt. Last on purpose: the identification string
//                           feeds Azerbaijani retrieval, so Turkish output is
//                           a degraded — though still useful — signal.
//
// DELIBERATELY EXCLUDED, each verified rather than assumed:
//   DeepSeek        HTTP 400 `unknown variant image_url` — the API rejects
//                   image parts outright. It CANNOT do vision at any model id,
//                   including deepseek-chat. (Asked for directly; measured.)
//   NVIDIA NIM      HTTP 500 "multimodal processing is not enabled".
//   OpenRouter      the free vision slugs now 404 ("unavailable for free").
//   mistral-small   THE DANGEROUS ONE: HTTP 200, and wrong 4 times out of 4
//                   ("Dönüş yolu" for a fuel-station sign). A model that
//                   accepts an image and confabulates is worse than one that
//                   errors — the chain would stop at it and hand a confident
//                   wrong identification to retrieval, which is precisely the
//                   bug this chain exists to fix. Never add a vision slot
//                   without running the discriminating test first.
export function getVisionModelChain(): ModelSlot[] {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';

  // Claude has vision and is the configured provider — it leads, matching
  // getVisionModel()'s existing precedence.
  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    const modelId = resolveChatModelId();
    return [{ model: anthropic(modelId), modelId: `${modelId}:anthropic` }];
  }

  const chain: ModelSlot[] = [];

  const primaryGoogle = process.env.GOOGLE_VISION_MODEL ?? 'gemini-3.1-flash-lite';
  const backupGoogle = process.env.GOOGLE_VISION_MODEL_BACKUP ?? 'gemini-3.5-flash';
  for (const modelId of primaryGoogle === backupGoogle
    ? [primaryGoogle]
    : [primaryGoogle, backupGoogle]) {
    for (const [key, label] of [
      [process.env.GOOGLE_GENERATIVE_AI_API_KEY, 'g1'],
      [process.env.GOOGLE_GENERATIVE_AI_API_KEY_2, 'g2'],
    ] as const) {
      const slot = geminiSlot(modelId, key, label);
      if (slot) chain.push(slot);
    }
  }

  // Cross-PROVIDER tail. The Gemini slots above share one upstream: the 503
  // that started this was a Google-side capacity problem, and two API keys
  // against the same overloaded model do not route around it.
  const groqVisionModel = process.env.GROQ_VISION_MODEL ?? process.env.GROQ_MODEL;
  if (groqVisionModel) {
    for (const [key, label] of [
      [process.env.GROQ_API_KEY, 'groq1'],
      [process.env.GROQ_API_KEY_2, 'groq2'],
    ] as const) {
      const slot = groqSlot(groqVisionModel, key, label, GROQ_REASONING_OFF);
      if (slot) chain.push(slot);
    }
  }

  const mistralVisionModel = process.env.MISTRAL_VISION_MODEL ?? 'pixtral-12b-latest';
  const mistral = mistralSlot(mistralVisionModel, process.env.MISTRAL_API_KEY);
  if (mistral) chain.push(mistral);

  return chain;
}

// Cheap/sync (no network call) by design — called both as a server-side route
// guard and passed down as a prop to the /chat page on every load to decide
// whether to show the image-attach UI at all.
//
// Reads the CHAIN, not getVisionModel(): a deployment with no Google key but a
// Groq or Mistral one can still look at a photo, and the attach button must
// appear for it.
export function isVisionAvailable(): boolean {
  return getVisionModelChain().length > 0;
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
