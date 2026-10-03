# resume-god

Profile-driven resume tooling for Rahul Aithal.

Resume God turns a reviewed master profile and a job description into:

- a one-page, ATS-friendly Typst PDF resume;
- a machine-readable tailoring plan;
- a readable match report with scores, evidence, rewrite decisions, and gaps.

The core safety rule is unchanged: the system may select and lightly reword
only facts present in `master_profile.yaml`. It must never invent skills,
technologies, numbers, employers, or dates.

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
./scripts/install-cli.sh
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

The equivalent module invocation is:

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

Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and/or `GLM_API_KEY` (or
`ZAI_API_KEY`), optionally in a `.env` file. `RESUME_GOD_LLM_ORDER`
(default `gemini,glm`) controls auto preference. Every report records what
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

## Web UI (FastAPI, no npm)

```bash
resume-god web --port 8000
```

Open `http://127.0.0.1:8000`: dashboard with company/role counts, per-company
pages, `/new` paste-a-JD form that generates the Typst PDF + skill diff and
records the role, and `/files/...` links to each generated PDF/`.typ` source.

## Local Neo4j graph

Start the configured local database:

```bash
docker compose up -d neo4j
```

Load the reviewed profile:

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
uv run python -m unittest discover -s tests -v
```

The Neo4j load test is optional and runs when `RESUME_GOD_NEO4J_URI` and
`RESUME_GOD_NEO4J_PASSWORD` are set. Typst PDF tests run when Typst is
available through `TYPST_BIN`, `.venv/bin/typst`, or `PATH`.

## Global CLI maintenance

Update after pulling changes:

```bash
cd /path/to/resume-god
git pull
./scripts/install-cli.sh
```

Remove the global command:

```bash
/path/to/resume-god/scripts/uninstall-cli.sh
```

Environment overrides:

```bash
export RESUME_GOD_PROFILE=/path/to/master_profile.yaml
export RESUME_GOD_MANIFEST=/path/to/applications.yaml
export TYPST_BIN=/path/to/typst
```
