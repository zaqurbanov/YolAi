# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this is

A RAG (Retrieval-Augmented Generation) chat app for Azerbaijan traffic law ("Yol Hərəkəti Qaydaları"). Admins upload PDFs of the traffic rules; authenticated users ask questions in Azerbaijani and get answers grounded in the uploaded documents, with citations back to the specific document/article/page. Hallucination avoidance is a hard requirement here — the system prompt in `lib/rag/buildPrompt.ts` instructs the model to answer only from retrieved context and to say so explicitly when it can't.

## Commands

```bash
npm run dev      # start dev server (Turbopack)
npm run build    # production build (also runs TypeScript checking)
npm run lint     # ESLint (flat config, eslint.config.mjs)
npx tsc --noEmit # type-check only, no build
```

There is no test suite yet.

Before running `npm run dev`, check whether a dev server is already running on port 3000 (`curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` or `netstat -ano | findstr :3000` on Windows) and reuse it instead of starting a new one. Next itself does not refuse to start a second `next dev` against the same repo — it silently retries on the next free port — but both instances share the same `.next/dev` Turbopack cache, and the second instance corrupts it, causing routes to spuriously 404 across the whole app (this has happened repeatedly). A `predev` script (`scripts/check-dev-port.js`) now blocks a second `next dev` from starting when port 3000 is occupied, but treat it as a backstop, not a substitute for checking first — especially across different agent/subagent shell sessions.

## Environment setup

Copy `.env.local.example` to `.env.local` and fill in:
- Supabase project URL/anon key/service role key
- `LLM_PROVIDER` (`openrouter` | `anthropic`) plus the matching API key/model env vars

Before the app is usable, run the SQL files in `supabase/migrations/` in order (`0001_init.sql`, then `0002_rls_policies.sql`) against the Supabase project via the SQL editor — there is no migration runner wired up. To make a user an admin, manually set `role = 'admin'` on their `profiles` row via SQL/Studio (no self-serve admin signup).

## Architecture

**Data flow (ingestion):** admin uploads a PDF via `app/admin/upload` → `app/api/admin/documents/route.ts` (admin-gated, stores file in Supabase Storage, inserts a `documents` row) → `lib/ingestion/ingestDocument.ts` orchestrates: `parsePdf.ts` (page-by-page text via `unpdf`) → `chunkText.ts` (splits on legal markers like `Maddə \d+`/`Fəsil`/`Bölmə` first, then size+overlap within long segments) → `lib/embeddings/embed.ts` (local embedding, no external API) → chunk rows inserted with `embedding vector(384)`.

**Data flow (query):** `app/chat/page.tsx` uses `useChat` (`@ai-sdk/react`) against `app/api/chat/route.ts`, which embeds the question, calls the `match_chunks` Postgres RPC (pgvector cosine search, defined in `0001_init.sql`) via `lib/retrieval/search.ts`, builds a grounded system prompt (`lib/rag/buildPrompt.ts`), and streams a response from the LLM.

**LLM provider abstraction (important):** `lib/llm/index.ts` is the *only* place that picks an LLM provider, branching on `process.env.LLM_PROVIDER`. The app currently runs against a free OpenRouter model for testing; production is meant to switch to Claude API by changing env vars only (`LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL`). Don't import `@openrouter/ai-sdk-provider` or `@ai-sdk/anthropic` directly from route/UI code — go through `getChatModel()`. It also exports `getChatModelFallback()`/`getRewriteModelFallback()`, returning a Google Gemini model (via `@ai-sdk/google`, not Gemini-via-OpenRouter) when `LLM_PROVIDER=openrouter` and `GOOGLE_GENERATIVE_AI_API_KEY` is set — OpenRouter's free-tier daily limit is account-wide across all `:free` models, so falling back to another OpenRouter model doesn't help; these return `null` otherwise, which `lib/llm/fallback.ts`/`lib/llm/streamWithFallback.ts` treat as "no fallback available."

**Embeddings are local, not an API call.** `lib/embeddings/embed.ts` runs `@huggingface/transformers` (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, 384-dim, chosen for Azerbaijani-language support) in-process on the server. This must stay dimensionally consistent with the `vector(384)` columns in the schema — changing the embedding model requires a migration to resize those columns and re-embedding all existing chunks.

**Auth and authorization layering:**
- `proxy.ts` (this is Next.js 16 — the file is `proxy.ts`, not `middleware.ts`, and the exported function is `proxy`, not `middleware`; see `AGENTS.md`) does an optimistic, cookie-only check and redirects unauthenticated users away from `/chat`, `/admin`, `/account`.
- Route handlers and server components do the real authorization: `lib/auth/requireAdmin.ts` checks `profiles.role === 'admin'` for admin-only routes/pages. Never rely on `proxy.ts` alone for the admin role check — it intentionally avoids DB calls.
- `lib/supabase/server.ts` / `lib/supabase/client.ts` are the user-scoped clients (respect RLS). `lib/supabase/admin.ts` uses the service-role key and bypasses RLS — it's only used server-side in the ingestion pipeline and admin document routes, never exposed to a request path a non-admin can trigger without going through `requireAdmin()` first.

**Schema** (`supabase/migrations/0001_init.sql`): `profiles` (extends `auth.users`, has `role`), `documents`/`chunks` (ingestion output), `conversations`/`messages` (chat history, `messages.citations` is jsonb built from actual retrieval results — not parsed from the model's own text), and `subscription_plans`/`user_subscriptions` (schema-only placeholders for future monetization, intentionally unused by any code path right now). RLS policies live in a separate migration (`0002_rls_policies.sql`).

**Monetization is deliberately not wired up.** `components/AdSlot.tsx` renders nothing unless `NEXT_PUBLIC_ADS_ENABLED=true`, and the subscription tables above have no application code reading/writing them yet. Don't build billing logic against them without checking with the user first — this was an explicit scope decision, not an oversight.

## Subagents

This repo defines custom subagents in `.claude/agents/`. For any non-trivial task, delegate to `lead` first and let it split the work — don't implement everything in the main conversation.

- **`lead`** (`.claude/agents/lead.md`) — engineering lead. Entry point for non-trivial tasks; decomposes work and delegates to `backend`/`frontend`/`designer`, sequences dependencies between them, verifies their output, and reports one integrated result.
- **`backend`** (`.claude/agents/backend.md`) — owns `app/api/`, `lib/` (RAG pipeline, ingestion, retrieval, LLM provider abstraction, auth/authorization, embeddings), `supabase/` schema & RLS, `proxy.ts`.
- **`frontend`** (`.claude/agents/frontend.md`) — owns `app/` pages/route groups, `components/`, styling, HeroUI React v3 usage, and frontend structural decisions, with an eye toward future load/scale.
- **`designer`** (`.claude/agents/designer.md`) — Figma-to-code implementer. Default Figma source: `https://www.figma.com/design/lS7X6iHKfa1MFjT3Xdqzc0/Untitled?node-id=0-1&t=JPFJ5rkDtB1VOYQb-1` (fileKey `lS7X6iHKfa1MFjT3Xdqzc0`), overridable per task.
