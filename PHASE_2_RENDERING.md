# Phase 2: deterministic resume rendering

## Purpose

Phase 2 turns a passing Phase 1 tailoring plan into reviewable and printable
resume artifacts. The implementation is in `resume_god/render.py`.

It produces:

- a Markdown resume suitable for review and version control; and
- a self-contained HTML resume with inline A4 print styling.

Open the HTML file in a browser and print it to PDF when you are ready to submit
the resume. The HTML does not load external scripts, fonts, stylesheets, or
images.

## Safety rules

- Only a Phase 1 plan with every audit check passing can be rendered.
- Only a profile whose status is `user_reviewed` can be rendered.
- Selected achievement objects must exactly match the reviewed master profile.
- Achievement text is rendered verbatim; Phase 2 does not rewrite claims.
- The rendered skills section contains only skills linked to selected evidence.
- Education and certifications are rendered from the reviewed profile.
- The default summary is a deterministic statement of selected evidence. It
  does not reuse a source summary or add unsupported claims.
- A caller may provide `--summary` when Rahul has reviewed wording for a
  particular application.

## Usage

Generate the tailoring plan, machine-readable plan, Markdown resume, and HTML
resume together:

```bash
.venv/bin/python -m resume_god \
  --profile master_profile.yaml \
  --job-description-file path/to/job.txt \
  --target-title "AI Automation Engineer" \
  --max-achievements 7 \
  --output outputs/ai-automation-plan.md \
  --json-output outputs/ai-automation-plan.json \
  --resume-output outputs/rahul-ai-automation.md \
  --resume-html-output outputs/rahul-ai-automation.html
```

Use a reviewed role-specific summary:

```bash
.venv/bin/python -m resume_god \
  --job-description-file path/to/job.txt \
  --target-title "AI Automation Engineer" \
  --max-achievements 7 \
  --resume-output outputs/rahul-ai-automation.md \
  --resume-html-output outputs/rahul-ai-automation.html \
  --summary "Production-focused AI automation engineer with reviewed experience shipping LLM pipelines and agent tooling."
```

Review `outputs/ai-automation-plan.md` before sending the resume. It records the
direct job-description skill matches, selected evidence, supporting skills,
ranking rationale, and audit results behind the final artifact.

## Acceptance checks

```bash
uv run python -m unittest discover -s tests -v
```

Phase 2 tests verify that only selected achievements and their linked skills are
rendered, source bullets remain unchanged, failed plans and unreviewed profiles
are rejected, custom summaries are validated, HTML content is escaped, and the
CLI writes plan and resume artifacts together.
