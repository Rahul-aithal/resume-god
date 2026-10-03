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

The offline deterministic path needs no API key.

- JD parsing: `--parser-provider glm` or `--parser-provider gemini`
- Bullet rewriting: `--rewrite-provider glm` or `--rewrite-provider gemini`

Set `GLM_API_KEY` or `GEMINI_API_KEY`. Provider output is still normalized and
grounding-checked against the reviewed profile. Any unsafe rewrite falls back
to the original source bullet.

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
