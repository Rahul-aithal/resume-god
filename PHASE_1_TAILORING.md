# Phase 1: deterministic tailoring plans

## Purpose

Phase 1 turns a target job description into an auditable evidence-selection plan.
It does not yet produce the final styled resume or rewrite any bullets. This
split keeps selection reviewable before a later phase introduces narrative
rewriting and layout.

The implementation is in `resume_god/tailor.py` and `resume_god/cli.py`.

## Safety rules

- Only skills represented in `master_profile.yaml` can be matched.
- A skill match requires a canonical name or one of its profile aliases to
  occur as a whole phrase in the job description.
- An achievement is eligible only when one of its canonical `skills` links
  directly matches the target description.
- Selected achievement objects are copied unchanged from the master profile.
- Supporting skills can only come from selected achievements; skills merely
  mentioned in the job description are never added to Rahul's claimed skills.
- Every output plan includes an audit that checks node existence, source
  excerpts, skill resolution, direct eligibility, and unchanged text.

## Selection policy

For each eligible achievement:

- 10 points per directly matched canonical skill
- 1 point per retained metric

The selector then greedily chooses achievements by:

1. newly covered target skills;
2. the achievement's raw score;
3. less repetition within an already selected experience or project, using a
   15-point parent penalty;
4. original profile order as the deterministic tie-breaker.

The policy favors coverage of explicit requirements while retaining strong
evidence and avoiding several similar bullets from the same parent node.

## Usage

Write a Markdown plan to stdout:

```bash
.venv/bin/python -m resume_god \
  --job-description-file path/to/job.txt \
  --target-title "AI Automation Engineer" \
  --max-achievements 8
```

Write both reviewable and machine-readable artifacts:

```bash
.venv/bin/python -m resume_god \
  --profile master_profile.yaml \
  --job-description-file path/to/job.txt \
  --target-title "AI Automation Engineer" \
  --max-achievements 8 \
  --output outputs/ai-automation-plan.md \
  --json-output outputs/ai-automation-plan.json
```

The command returns a non-zero status if any plan audit check fails.
Use `--job-description-file -` to read the description from standard input.

## Acceptance checks

```bash
.venv/bin/python -m unittest discover -s tests -v
```

The Phase 1 tests cover alias matching, partial-word false positives, target
evidence selection, unchanged profile objects, supporting-skill propagation,
Markdown review output, CLI JSON/Markdown writing, validation errors, and the
audit checks. Phase 0 profile tests continue to run in the same command.
