import 'server-only';
import { openrouter } from '@openrouter/ai-sdk-provider';
import { anthropic } from '@ai-sdk/anthropic';
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
  return provider === 'anthropic'
    ? process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'
    : process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-120b:free';
}

export function getChatModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  const modelId = resolveChatModelId();

  if (provider === 'anthropic') {
    return anthropic(modelId);
  }

  return openrouter(modelId, DISABLE_REASONING);
}

export function getChatModelId(): string {
  return resolveChatModelId();
}

function resolveRewriteModelId(): string {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  return provider === 'anthropic'
    ? process.env.ANTHROPIC_REWRITE_MODEL ?? 'claude-haiku-4-5'
    : process.env.OPENROUTER_REWRITE_MODEL ?? 'nvidia/nemotron-3-nano-30b-a3b:free';
}

// Small/cheap model for internal steps (query rewriting) — deliberately not the
// main chat model, which may be a slow "reasoning" model unsuitable for this task.
export function getRewriteModel(): LanguageModel {
  const provider = process.env.LLM_PROVIDER ?? 'openrouter';
  const modelId = resolveRewriteModelId();

  if (provider === 'anthropic') {
    return anthropic(modelId);
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
