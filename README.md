# resume-god

Profile-driven resume tooling — TypeScript edition.

Resume God turns your knowledge graph + a job description into:

- a ATS-friendly resume (Typst PDF and/or Word .docx);
- a machine-readable tailoring plan with audited evidence selection;
- a readable match report with scores, coverage, and gaps.

Pipeline: JD → graph retrieval (exact + 2-hop expansion + inference +
TF-IDF semantic) → coverage-aware selection → constrained rewriting →
resume-data → Typst v2 template → PDF. Deterministic end to end: no LLM
is required; configured providers only *enhance* parsing, bullet
selection, and rewriting — grounding checks always run.

## Status (2026-11-01)

The TypeScript cutover is complete: the original Python stack
(`resume_god`, `master_profile.yaml`, Neo4j, the `uv` CLI) has been
removed — Postgres is the only store and this monorepo is the only
implementation.

- **Server (NestJS, Bun):** Google OAuth auth, per-user tracker,
  settings, knowledge-graph CRUD + review gate, LLM provider failover
  (`gemini,glm,openai`), and the ported pipeline: jd-parser, tailor,
  rewrite, resume-data, plus Typst PDF and .docx render routes.
- **Web (React + Vite + Tailwind):** login, dashboard, companies/roles
  tracker, interactive knowledge-graph editor (React Flow), review
  gate, and settings — including provider reporting. Redesigned on
  2026-11-01: light/dark theme system (no first-paint flash, self-hosted
  Geist variable font), every page a lazy route chunk, nav prefetches
  chunks on hover, vendor chunks cached separately. UI is shadcn on Base
  UI. Initial JS is ~136 KB gzipped (was ~162 KB); the React Flow canvas
  (~57 KB gz + its CSS) loads only on `/graph`, and the Select chunk
  (~39 KB gz) only on pages with a dropdown.
- **Verification:** `bun run typecheck` clean; 75 server tests and 13
  web tests passing. The `rg-test-pg` container (postgres:16-alpine,
  `docker start rg-test-pg`) serves both purposes on **port 5433**:
  tests use the `resume_god_test` database, and host-run dev
  (`apps/server/.env`) points `DATABASE_URL` at `resume_god` on the
  same container. Compose dev instead exposes Postgres on 5432.

The core safety rule: the system may only ever present facts that exist
in your reviewed knowledge graph. Unknown skills are reported as gaps,
never promoted into claims.

## Monorepo layout (Bun + Turborepo)

```
apps/server/         NestJS API (Bun): auth, graph, tailor, render
apps/web/            React + Vite + Tailwind SPA
packages/api-client/ Shared typed API shapes
docker/              Dockerfile.server (bun+typst), Dockerfile.web, nginx.conf
.agents/skills/      Project agent skills
```

One database: Postgres (Drizzle ORM). The knowledge graph — skills,
experiences, projects, achievements, education, certifications,
implication edges, contact, soft skills — lives in normalized `kg_*`
tables. YAML/JSON are import/export formats only, never storage.

## Quick start

```bash
bun install
docker compose -f compose.yaml -f compose.dev.yaml up --build
# SPA: http://localhost:5173   API: http://localhost:3000
```

Or without Docker:

```bash
bun install
bun run dev      # server (3000) + web (5173) via turbo
```

Google login: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
(`apps/server/.env`); register the redirect URI
`http://localhost:5173/api/auth/callback/google`. Without credentials the
login page explains setup instead of crashing.

## Knowledge graph

- `/graph` — interactive React Flow canvas: click any node to edit,
  add/delete skills, experiences, projects, achievements, education,
  certifications, soft skills, and implication edges.
- Import: paste a profile document (YAML or JSON) — files are transport,
  never storage.
- Export: download the full graph as YAML/JSON any time.
- Review gate: tailoring/rendering requires "Mark reviewed"; edits clear
  it, keeping unreviewed data out of resumes.

Auth account is the fallback identity: with no contact row, your Google
name/email are used.

## LLM providers (optional)

`GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `GLM_API_KEY` (or
`ZAI_API_KEY`/`ZHIPU_API_KEY`), `OPENAI_API_KEY` — set any of them in
`apps/server/.env`. Users can also add their own keys under Settings →
Your API keys: a user's key takes priority over the server's for their
runs. Keys are encrypted with AES-256-GCM using a key derived from
`BETTER_AUTH_SECRET` (or `SESSION_SECRET`) and only the last 4 characters
are ever returned. Changing that secret makes saved keys unreadable, and
the page asks users to enter them again. `RESUME_GOD_LLM_ORDER` (default `gemini,glm,openai`)
controls auto preference; every stage reports requested vs used with
fallback reasons. Deterministic output never crashes without keys.

## Background tailoring

Tailoring runs as a background job, so it continues if you leave the page.
Postgres is the queue (`tailor_jobs`, claimed with `FOR UPDATE SKIP LOCKED`),
so jobs survive restarts and no extra service is needed. A running job that
stops sending heartbeats for 2 minutes is retried, up to 3 attempts. Each
server runs 2 jobs at once, and each user can have 10 in progress.

- `POST /api/tailor/jobs` queues a job and returns immediately (202).
- `GET /api/tailor/jobs` lists your latest 50 jobs, without their results.
- `GET /api/tailor/jobs/:id` returns one job with its result.

The web app lists them under Tailoring. `POST /api/tailor` still runs
synchronously for scripts.

## JSON API

```bash
curl -s localhost:3000/api/health
curl -s localhost:3000/api/graph            # full projection (auth required)
curl -s -X POST localhost:3000/api/tailor \
  -H 'Content-Type: application/json' \
  -d '{"jd_text": "...", "max_achievements": 6}'
curl -s -X POST localhost:3000/api/render   # resume-data → PDF
curl -s localhost:3000/api/render/docx      # resume.docx download
```

## Tests

```bash
bun run test        # server (bun test) + web + api-client + turbo
bun run typecheck   # tsc (TypeScript 7) across all packages
bun run lint        # prettier
```

## Backups

Postgres holds everything (the graph is normalized tables, no files to
back up besides `outputs/`). Dump it any time:

```bash
./scripts/backup-db.sh            # → backups/resume-god-<timestamp>.dump
```

Restore with the command printed by the script. Take a backup before any
major upgrade or migration.

## Going live (TLS + origins)

For anything beyond localhost, terminate TLS in front of the stack
(Caddy, nginx, Cloudflare Tunnel — any of them) and point it at `:8080`.
Then set, in production env (never in the repo):

```text
BETTER_AUTH_URL=https://resume.example.com
AUTH_TRUSTED_ORIGINS=https://resume.example.com
SESSION_SECRET=<openssl rand -base64 32>   # or BETTER_AUTH_SECRET
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Register `https://resume.example.com/api/auth/callback/google` in Google
Cloud Console → Credentials → your OAuth client. The login page always
shows the exact redirect URI the server will send — copy it from there
instead of guessing.
