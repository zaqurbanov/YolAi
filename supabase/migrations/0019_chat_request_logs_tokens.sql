-- Adds token usage columns to chat_request_logs, sourced from streamText's
-- `usage` field (ai@7.0.16's LanguageModelUsage: inputTokens/outputTokens/
-- totalTokens, each `number | undefined` depending on provider support) in
-- app/api/chat/route.ts's onFinish callback. Additive `alter table ... add
-- column`, same style as 0012/0013/0015 -- no backfill for existing rows,
-- which will simply have null token counts going forward from before this
-- migration is applied.
alter table chat_request_logs
  add column prompt_tokens numeric,
  add column completion_tokens numeric,
  add column total_tokens numeric;
