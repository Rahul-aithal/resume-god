# Original Phase 5: Typst rendering and one-command CLI

## Status

Implemented.

Resume God now produces an ATS-friendly, single-column A4 PDF with Typst and
writes an audited match report in the same command.

## Global CLI setup

Install the CLI command once:

```bash
./scripts/install-cli.sh
```

The script installs `resume-god` with `uv tool`, adds the local Typst renderer,
and runs `resume-god doctor`. Verify it from any directory:

```bash
resume-god doctor
```

For development only, the project-level Typst installer remains available:

```bash
./scripts/install-typst.sh
```

The script installs `.venv/bin/typst`. `TYPST_BIN` can override that path.

## One-command usage

```bash
resume-god tailor fixtures/jds/jd-1.txt \
  --target-title "Software Developer" \
  --parser-provider deterministic \
  --rewrite-provider deterministic \
  --out outputs/resume.pdf
```

The command writes:

- `outputs/resume.pdf`
- `outputs/resume-report.md`
- `outputs/resume-plan.json`

`resume-god` is installed by `uv sync`. The equivalent module command is:

```bash
uv run python -m resume_god.cli tailor fixtures/jds/jd-1.txt \
  --target-title "Software Developer" \
  --parser-provider deterministic \
  --rewrite-provider deterministic \
  --out outputs/resume.pdf
```

If `--target-title` is omitted, the Phase 2 parser derives it from the JD. Use `--parser-provider glm` or `--parser-provider gemini` for remote structured parsing.

## One-page enforcement

The renderer compiles the full assembled resume and checks the actual PDF page
count with `pypdf`. If it spills to page two, resume-god removes the
lowest-ranked bullet and compiles again. It repeats this until the PDF is one
page, then records every removed ID in the machine-readable report and Markdown
report.

## Reports

The Markdown report includes:

- direct skill matches
- selected evidence
- semantic retrieval results
- graph expansion
- requirement coverage
- unknown and unevidenced skill gaps
- ranking scores and components
- one-page assembly decisions
- rewrite/fallback decisions
- final PDF page count and audit result

## Remote providers

```bash
resume-god tailor jd.txt --out resume.pdf \
  --parser-provider glm --rewrite-provider glm

resume-god tailor jd.txt --out resume.pdf \
  --parser-provider gemini --rewrite-provider gemini
```

Set `GLM_API_KEY` or `GEMINI_API_KEY`. Provider JD output is normalized through
the reviewed alias table. Every model rewrite must pass the deterministic
Phase 4 grounding validator or it falls back to the reviewed source bullet.
