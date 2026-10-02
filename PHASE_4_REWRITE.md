# Original Phase 4: assembly, constrained rewrite, grounding validator

## Status

Implemented.

## Assembly

`resume_god.assembly` orders selected bullets and parent sections by retrieval
rank. It applies a conservative one-page character budget and removes the
lowest-ranked evidence first. The retained and trimmed IDs are recorded in the
machine-readable plan.

## Rewriting

`resume_god.rewrite` sends only selected source bullets to the chosen provider:

- `deterministic` — no model call; every bullet falls back to its reviewed source
- `glm` — GLM structured output, configured with `GLM_API_KEY`
- `gemini` — Gemini structured output, configured with `GEMINI_API_KEY`

The model is instructed to lightly adapt phrasing without changing facts.

## Deterministic grounding validator

A rewrite is accepted only when:

- its achievement exists in the reviewed profile;
- its source text exactly matches the profile;
- it introduces no canonical profile skill absent from the source bullet;
- it introduces no technology name absent from the source bullet;
- it introduces no number absent from the source bullet;
- it is not excessively long or keyword-stuffed.

Any failure rejects the rewrite and falls back to the original reviewed bullet.
The plan records whether each rewrite was used or replaced by fallback.

## Usage

```bash
uv run python -m resume_god \\
  --profile master_profile.yaml \\
  --job-description-file fixtures/jds/jd-1.txt \\
  --target-title "Software Developer" \\
  --max-achievements 7 \\
  --rewrite-provider deterministic \\
  --page-budget-chars 3200 \\
  --output outputs/jd-1-plan.md \\
  --json-output outputs/jd-1-plan.json \\
  --resume-output outputs/jd-1-resume.md
```

Use GLM or Gemini by changing `--rewrite-provider` and setting the corresponding
API key.
