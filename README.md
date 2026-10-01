# resume-god

Profile-driven resume tooling for Rahul Aithal.

The project keeps resume generation auditable:

1. **Phase 0** normalizes and user-reviews the master profile.
2. **Phase 1** selects relevant, source-backed evidence for a target job.
3. **Phase 2** renders the selection as Markdown and printable HTML.
4. **Phase 3** builds multiple audited application packets from one manifest.

## Quick start

```bash
uv sync

uv run python -m resume_god \
  --profile master_profile.yaml \
  --job-description-file path/to/job.txt \
  --target-title "AI Automation Engineer" \
  --max-achievements 7 \
  --output outputs/ai-automation-plan.md \
  --json-output outputs/ai-automation-plan.json \
  --resume-output outputs/rahul-ai-automation.md \
  --resume-html-output outputs/rahul-ai-automation.html
```

Review the tailoring plan first, then open the HTML resume in a browser and use
the browser's **Print → Save as PDF** action.

Build every application listed in `applications.yaml`:

```bash
uv run python -m resume_god.applications \
  --manifest applications.yaml \
  --output-dir outputs/applications
```

## Documentation

- `PHASE_0_REVIEW.md` — reviewed profile decisions and remaining date gaps
- `PHASE_1_TAILORING.md` — deterministic evidence selection
- `PHASE_2_RENDERING.md` — safe Markdown and HTML resume rendering
- `PHASE_3_APPLICATIONS.md` — deterministic multi-application packets

## Tests

```bash
uv run python -m unittest discover -s tests -v
```
