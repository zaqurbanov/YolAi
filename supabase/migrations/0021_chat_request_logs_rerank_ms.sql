-- Adds the rerank-stage latency column to chat_request_logs, sourced from
-- rerankChunks()'s returned rerankMs in app/api/chat/route.ts's onFinish
-- callback. Additive `alter table ... add column`, same style as 0019 -- no
-- backfill for existing rows.
alter table chat_request_logs
  add column rerank_ms numeric;
