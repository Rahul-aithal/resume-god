# resume-god

Profile-driven resume tooling for Rahul Aithal.

Resume God turns a reviewed master profile and a job description into:

- a one-page, ATS-friendly Typst PDF resume;
- a machine-readable tailoring plan;
- a readable match report with scores, evidence, rewrite decisions, and gaps.

Pipeline: JD → graph retrieval (exact + 2-hop expansion + semantic) →
LLM selects and writes **resume-data JSON** (schema v1) → grounding
validation → `resume-data.json` → static Typst template (file import, no
string interpolation) → one-page PDF. Bare `typst compile` on a reviewed
pair reproduces the identical PDF.

The core safety rule is unchanged: the system may select and lightly reword
only facts present in `master_profile.yaml`. It must never invent skills,
technologies, numbers, employers, or dates.

## Monorepo layout (Bun + Turborepo + Docker)

```
apps/api/          Python pipeline: resume_god/, tests/, profile, fixtures
apps/web/          React + Vite + Tailwind SPA (served by the stack)
packages/api-client/  Shared typed API shapes for the future JSON API
docker/            Dockerfiles + nginx config
compose.yaml       Prod-like stack: web + api + postgres (+ opt-in neo4j)
compose.dev.yaml   Local overrides: live reload, host ports
```

JS tooling is Bun-only (no npm). Turbo orchestrates everything:

```bash
bun install                  # root, once
bun run dev                  # api + web with live reload (via turbo)
bun run build                # all packages
bun run test                 # vitest suites + 75-test Python suite
bun run lint                 # prettier + python compile check
bun run typecheck            # tsc + python import smoke
```

Python commands below run with `apps/api` as the working directory
(e.g. `cd apps/api && uv run ...`). The installed `resume-god` global
command works from anywhere.

Run the full stack (web UI at http://localhost:8080):

```bash
docker compose up --build          # prod-like: nginx SPA + api + postgres
docker compose -f compose.yaml -f compose.dev.yaml up --build   # local dev
```

App env lives in `apps/api/.env` (gitignored; see `.env.example`).
`PHASE_*.md` docs predate the monorepo move — run their commands from
`apps/api/`.

## Original phase status

| Original phase | Status | Documentation |
|---|---|---|
| Phase 0 — Master profile | Complete | `PHASE_0_REVIEW.md` |
| Phase 1 — Graph schema and loader | Complete | `PHASE_1_GRAPH_LOADER.md` |
| Phase 2 — JD parser and normalization | Complete | `PHASE_2_JD_PARSER.md` |
| Phase 3 — Retrieval, scoring, gaps | Complete | `PHASE_3_RETRIEVAL.md` |
| Phase 4 — Assembly and constrained rewrite | Complete | `PHASE_4_REWRITE.md` |
| Phase 5 — Typst render and CLI | Complete | `PHASE_5_RENDER_CLI.md` |

The repository also contains working convenience layers:

- `PHASE_1_TAILORING.md` describes the deterministic selection API.
- `PHASE_2_RENDERING.md` describes safe Markdown/HTML rendering.
- `PHASE_3_APPLICATIONS.md` describes manifest-driven application packets.

## Quick start

Install the global CLI command once:

```bash
git clone https://github.com/Rahul-aithal/resume-god.git
cd resume-god
./apps/api/scripts/install-cli.sh
```

The installer uses `uv tool`, installs the `resume-god` command on PATH, and adds
the local Typst renderer. After installation, you do not need to enter the
repository or `.venv`.

Check the installation from anywhere:

```bash
resume-god doctor
```

Generate a one-page PDF, match report, and machine-readable plan:

```bash
resume-god tailor path/to/job.txt \
  --target-title "Software Developer" \
  --out outputs/software-developer/resume.pdf
```

If `--target-title` is omitted, the JD parser derives it from the description.

The command writes:

```text
outputs/software-developer/resume.pdf
outputs/software-developer/resume-report.md
outputs/software-developer/resume-plan.json
```

Resumes render in Calibri (with automatic fallback when it is not
installed). Override per run with `--font "Times New Roman"`.

## Review gate: AI generates JSON, you review, JSON goes to Typst

`tailor` writes `resume-plan.json` (graph evidence + LLM selection +
rewrites). Review it — edit any `rewrites.<id>.rewritten_text`, drop or
reorder bullets — then render from the reviewed file. Every edit is
re-validated (unknown ids dropped, unsafe texts fall back to the reviewed
original) before Typst compiles:

```bash
resume-god tailor path/to/job.txt \
  --target-title "Software Developer" \
  --out outputs/software-developer/resume.pdf
# ... review outputs/software-developer/resume-plan.json ...
resume-god render-pdf \
  --plan outputs/software-developer/resume-plan.json \
  --out outputs/software-developer/resume-reviewed.pdf \
  --data-output outputs/software-developer/resume-data.json
```

`--select-provider auto|glm|gemini|deterministic` controls who picks the
bullets from graph-ranked evidence (default: LLM when a key exists, else
deterministic ranking). `--data-output` keeps the validated
`resume-data.json` that the static template (`apps/api/resume_god/template/resume.typ`)
imports — recompile it any time with plain `typst compile`.

The equivalent module invocation (from `apps/api/`):

```bash
uv run python -m resume_god.cli tailor path/to/job.txt \
  --target-title "Software Developer" \
  --out outputs/software-developer/resume.pdf
```

## LLM providers

Both default to `auto`: an LLM is used when a key exists, otherwise the
offline deterministic path runs — never a crash.

- JD parsing: `--parser-provider auto|glm|gemini|deterministic`
- Bullet rewriting: `--rewrite-provider auto|glm|gemini|deterministic`
- Bullet selection: `--select-provider auto|glm|gemini|deterministic`

Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and/or `GLM_API_KEY` (or
`ZAI_API_KEY`), optionally in a `.env` file. `RESUME_GOD_LLM_ORDER`
(default `gemini,glm`) controls auto preference, and `GEMINI_MODEL`
(default `gemini-3-flash-preview`) selects the Gemini model. Every report records what
was requested vs actually used under `## Providers`, including fallback
reasons.

Provider output is still normalized through the reviewed alias table
(`JS→JavaScript`, `TS→TypeScript`, …) and grounding-checked against the
reviewed profile. Any unsafe rewrite falls back to the original source
bullet, and any provider/network failure falls back to deterministic.

The skill graph also carries curated framework→foundation edges
(`SKILL_IMPLIES` in `resume_god/graph.py`: Next.js→React/TypeScript/JS,
React→JS, NestJS→Node/TS, …). Framework work counts as weaker
`inferred_covered` evidence for language requirements — always labeled as
inferred, never as a direct claim.

## Application packets

Build Markdown and HTML packets:

```bash
resume-god applications \
  --manifest applications.yaml \
  --output-dir outputs/applications
```

Also generate one Typst PDF per application:

```bash
resume-god applications \
  --manifest applications.yaml \
  --output-dir outputs/applications \
  --pdf
```

Both `--manifest` and `--profile` are optional. They default to the reviewed
files in the checkout or to `RESUME_GOD_MANIFEST` and `RESUME_GOD_PROFILE`.

Resumes render with the official Typst template
`@preview/basic-resume:0.2.9` (`#show: resume.with(...)` + `#work` / `#project`
/ `#edu` / `#certificates`). First compile downloads the package once; later
compiles reuse the Typst cache.

## Company tracker (SQLite)

Keep per-company data plus how many roles you applied to and which ones:

```bash
resume-god company add Goodspace --about "AI hiring products" --location "Noida (Remote)"
resume-god role add --company Goodspace --title "Software Engineer" --jd-file job.txt
resume-god role list --company Goodspace
resume-god role status 1 interview
resume-god company show Goodspace
```

DB defaults to `data/companies.db` (override with `--db` or `RESUME_GOD_DB`).

Every `tailor` report now ends with a skill-diff section:

> To join as X they expect N skills; you have evidence for M …

so you can see “they expect all these, I have exposure in only these”.

## Web UI

Local FastAPI UI (legacy server-rendered pages until the M1 JSON API lands;
the React SPA in `apps/web/` is scaffolded and served by the docker stack):

```bash
resume-god web --port 8000
```

Open `http://127.0.0.1:8000`: dashboard with company/role counts, per-company
pages, `/new` paste-a-JD form that generates the Typst PDF + skill diff and
records the role, and `/files/...` links to each generated PDF/`.typ` source.

## Local Neo4j graph

Start the configured local database:

```bash
docker compose --profile graph up -d neo4j
```

Load the reviewed profile (from `apps/api/`):

```bash
resume-god graph load \
  --profile master_profile.yaml \
  --uri bolt://localhost:7687 \
  --user neo4j \
  --password resume-god-local
```

Offline graph and semantic queries work without Neo4j:

```bash
resume-god graph query \
  --skill Go \
  --project project_eventmcp \
  --search "LLM agent calendar tool" \
  --limit 5
```

## Tests

```bash
bun run test                              # everything (turbo)
(cd apps/api && uv run python -m unittest discover -s tests -v)
```

The Neo4j load test is optional and runs when `RESUME_GOD_NEO4J_URI` and
`RESUME_GOD_NEO4J_PASSWORD` are set. Typst PDF tests run when Typst is
available through `TYPST_BIN`, `.venv/bin/typst`, or `PATH`.

## Global CLI maintenance

Update after pulling changes:

```bash
cd /path/to/resume-god
git pull
./apps/api/scripts/install-cli.sh
```

Remove the global command:

```bash
/path/to/resume-god/apps/api/scripts/uninstall-cli.sh
```

Environment overrides:

```bash
export RESUME_GOD_PROFILE=/path/to/master_profile.yaml
export RESUME_GOD_MANIFEST=/path/to/applications.yaml
export TYPST_BIN=/path/to/typst
```
