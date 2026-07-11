-- Tracks whether a chat request fell back from the primary OpenRouter model to
-- the Google Gemini fallback (lib/llm/streamWithFallback.ts), so how often the
-- OpenRouter free-tier daily limit is actually hit can be observed over time.
alter table chat_request_logs
  add column used_fallback boolean not null default false;
