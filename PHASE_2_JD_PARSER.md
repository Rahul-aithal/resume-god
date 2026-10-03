# Original Phase 2: JD parser and skill normalization

## Status

Implemented.

The parser turns a JD into structured JSON and normalizes recognized skill names
through the reviewed profile alias table. Unknown technologies remain unchanged
and are explicitly reported.

## Output

```json
{
  "version": 1,
  "provider": "deterministic",
  "role_title": "Software Developer",
  "seniority": "not specified",
  "must_have_skills": [],
  "nice_to_have_skills": [],
  "unknown_skills": [],
  "keywords": [],
  "key_responsibilities": []
}
```

## Providers

- `deterministic` — offline default used by tests and safe local operation
- `glm` — default remote provider, configured with `GLM_API_KEY`
- `gemini` — selectable remote provider, configured with `GEMINI_API_KEY`

The remote providers return JSON only. After parsing, resume-god still applies
the profile alias table itself; a model cannot silently turn an unknown skill
into a reviewed profile skill.

## Usage

```bash
uv run python -m resume_god.jd_parser fixtures/jds/jd-1.txt \
  --profile master_profile.yaml \
  --json-output outputs/jd-1.json

uv run python -m resume_god.jd_parser fixtures/jds/jd-1.txt \
  --provider glm \
  --target-title "Software Developer"

uv run python -m resume_god.jd_parser fixtures/jds/jd-1.txt \
  --provider gemini
```
