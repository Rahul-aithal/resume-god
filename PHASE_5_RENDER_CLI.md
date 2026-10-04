# Original Phase 5: Typst rendering and one-command CLI

## Status

Implemented.

Resume God now produces an ATS-friendly, single-column A4 PDF with Typst and
writes an audited match report in the same command.

## Global CLI setup

Install the CLI command once (from the repo root):

```bash
./apps/api/scripts/install-cli.sh
```

The script installs `resume-god` with `uv tool`, adds the local Typst renderer,
and runs `resume-god doctor`. Verify it from any directory:

```bash
resume-god doctor
```

For development only, the project-level Typst installer remains available:

```bash
./apps/api/scripts/install-typst.sh
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

`resume-god` is installed by `uv sync`. The equivalent module command is
(run from `apps/api/`):

```bash
uv run python -m resume_god.cli tailor fixtures/jds/jd-1.txt \
  --target-title "Software Developer" \
  --parser-provider deterministic \
  --rewrite-provider deterministic \
  --out outputs/resume.pdf
```

If `--target-title` is omitted, the Phase 2 parser derives it from the JD. Use `--parser-provider glm` or `--parser-provider gemini` for remote structured parsing.

## Font

Resumes render in Calibri by default (override with `--font`, e.g.
`--font "Times New Roman"`). The requested font is emitted with a fallback
chain (`Carlito`, `Liberation Sans`, `DejaVu Sans`) so machines without the
proprietary font still compile; the report records the requested font under
`## PDF output`.

## Review gate: AI JSON in, Typst PDF out

`tailor` runs the full pipeline — JD → graph retrieval → LLM selection
(`--select-provider`) → constrained rewriting → resume-data JSON (schema v1)
— and writes the AI-generated intermediate `resume-plan.json`. Review it
(edit `rewrites.<id>.rewritten_text`, drop/reorder bullets, or pass a new
`--summary`), then render the final PDF from the reviewed file:

```bash
resume-god render-pdf --plan outputs/resume-plan.json --out outputs/resume-reviewed.pdf --data-output outputs/resume-data.json
```

`render-pdf` re-validates every reviewed edit against the reviewed profile
(`rewrite.revalidate_plan_rewrites` + `resume_data.validate_resume_data`):
unknown achievement ids are dropped, edits that introduce new skills,
technologies, or numbers fall back to the reviewed original (listed on
stderr), and edits to `source_text` itself are refused.

## Typst file import (no string interpolation)

The static template `resume_god/template/resume.typ` reads its data with
`#let plan = json("resume-data.json")` — Python never interpolates text into
Typst source. Python only validates the JSON, stages both files, and
compiles. Any reviewed `resume-data.json` recompiles standalone:

```bash
typst compile resume.typ resume.pdf
```

producing the byte-equivalent-content PDF (verified: identical extracted
text). The font rides in the JSON (`"font"` field); the template appends the
fallback chain.

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
