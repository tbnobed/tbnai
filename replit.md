# Book Archive RAG Search

An internal search tool for a broadcasting ministry's book publishing archive. Staff ask questions in plain English and receive synthesized answers with citations back to specific books, chapters, and pages — powered by retrieval-augmented generation over the full text of the published catalog.

## Run & Operate

- `pnpm --filter @workspace/archive-search run dev` — frontend dev server
- `pnpm --filter @workspace/api-server run dev` — API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Project rule — Docker-first, self-contained builds

**Everything built for this project must run independently via `docker compose up`. Nothing may depend on Replit hosting.**

- All configuration via environment variables. No hardcoded hosts, ports, secrets, or URLs.
- No Replit-specific integrations, secrets managers, or platform APIs in application code.
- All services containerized: database, API, web frontend, any future workers.
- The Replit workspace is used for development only. The canonical deployment target is the self-hosted Docker Compose stack defined in `docker-compose.yml`.
- Env vars for local dev go in a `.env` file (gitignored). See `.env.example` for all required values.
- Before introducing any new external dependency or service, verify it can be configured entirely through env vars and works inside a Docker container with no Replit-specific scaffolding.

## Stack

- pnpm workspaces, Node.js 22, TypeScript 5.9
- Frontend: React 19 + Vite 7 + TailwindCSS 4 + shadcn/ui
- API: Express 5 + Clerk Auth
- DB: PostgreSQL 16 + pgvector (embeddings) + Drizzle ORM
- RAG: OpenAI-compatible API (local gpt-oss-120b on DGX Spark)
- Validation: Zod v3, drizzle-zod
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — single source of truth for all API contracts
- `lib/db/src/schema/` — Drizzle schema: books, chunks (pgvector), search_results
- `artifacts/api-server/src/lib/rag.ts` — RAG pipeline (embed → retrieve → synthesize)
- `artifacts/api-server/src/lib/ingest.ts` — book ingestion (PDF/text → chunks → embeddings)
- `artifacts/api-server/src/routes/` — search, books, catalog routes
- `artifacts/archive-search/src/` — React frontend

## Architecture decisions

- **pgvector for embeddings**: chunks stored in Postgres with vector type; cosine similarity search via `<=>` operator. No separate vector DB required.
- **OpenAI-compatible API**: all model calls (embeddings + chat completions) go through the `OPENAI_BASE_URL` endpoint, making the system model-agnostic.
- **Fire-and-forget ingest**: book registration returns immediately; ingestion runs in the background. Status tracked as `pending → processing → ready | error`.
- **Session cookie auth**: Clerk handles auth via cookies on the web. No manual token handling in frontend API calls.
- **Docker Compose deployment**: all services containerized — `pgvector/pgvector:pg16`, Express API, Nginx static frontend.

## Product

- **Search** (`/search`): plain-English question input → LLM-synthesized answer → cited passages (book, chapter, page)
- **Library** (`/library`): browse the full book catalog, see ingestion status, inspect text chunks
- **History** (`/history`): personal search history with past queries and answers
- **Admin** (`/admin`): register new books for ingestion, view catalog stats, reindex/delete books

## Deployment (Docker Compose)

1. Copy `.env.example` to `.env` — fill in Postgres password, Clerk keys, and `OPENAI_BASE_URL`
2. Place book PDFs in `./books/` (bind-mounted into the API container as `/books/`)
3. `docker compose up -d`
4. Register books via POST `/api/books` with `filePath: /books/filename.pdf`; ingestion runs automatically

## Required env vars

- `DATABASE_URL` — Postgres connection string (set automatically in Docker Compose)
- `CLERK_SECRET_KEY` — from Clerk dashboard
- `CLERK_PUBLISHABLE_KEY` — from Clerk dashboard
- `OPENAI_BASE_URL` — local LLM endpoint (e.g. `http://dgx-spark.local:8080/v1`)
- `OPENAI_API_KEY` — set to `local` if no key required
- `CHAT_MODEL` — chat model name (default: `gpt-oss-120b`)
- `EMBEDDING_MODEL` — embedding model name
- `EMBEDDING_DIMENSIONS` — must match the model's output size (default: 1536)

## User preferences

_Populate as you build._

## Gotchas

- **EMBEDDING_DIMENSIONS**: changing this after books have been ingested requires dropping and recreating the `chunks` table, then re-ingesting all books.
- **pgvector extension**: must be enabled before schema push — handled automatically by `docker/init.sql` in the Docker container, and manually via `CREATE EXTENSION IF NOT EXISTS vector` for the dev database.
- **Integer types in OpenAPI**: use `type: number` not `type: integer` — Orval v8 generates `zod.int()` (Zod v4 API) for `integer` types, which breaks against the Zod v3 in this workspace.
- **Params name collision**: operations with both path params AND query params cause `ListXParams` collision in the api-zod barrel. Fix: remove query params from such endpoints (see `listBookChunks`).
- Always run `pnpm run typecheck:libs` after changing `lib/*` packages before running leaf artifact typechecks.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
