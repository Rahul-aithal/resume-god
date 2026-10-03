# Original Phase 3: retrieval, scoring, and gap report

## Status

Implemented.

Every fixture JD now flows through:

1. exact canonical-name/alias matching;
2. deterministic TF-IDF cosine semantic search over achievement embeddings;
3. two-hop graph expansion through reviewed achievement and parent links;
4. scoring across must-have coverage, nice-to-have coverage, semantic similarity,
   recency, and metrics;
5. explicit requirement coverage and gap reporting.

## Ranking formula

For each candidate achievement:

```text
score =
  12 × direct must-have skills
+  7 × direct nice-to-have skills
+  3 × two-hop expanded skills
+  8 × cosine similarity
+  4 × recency score
+  1–2 for metrics
```

Exact requirement coverage dominates selection. Graph expansion and semantic
similarity can surface additional reviewed evidence, but they cannot add a skill
that is absent from the selected achievement's canonical profile links.

## Gap statuses

- `covered` — a selected achievement directly evidences the requirement
- `profile_skill_not_selected` — evidence exists but was not selected within the limit
- `profile_skill_without_evidence` — the profile knows the skill but has no linked achievement evidence
- `unknown_no_profile_match` — the JD skill is not in the reviewed profile

Unknown skills remain in the gap report and are never rendered as skills.

## Usage

```bash
uv run python -m resume_god \
  --profile master_profile.yaml \
  --job-description-file fixtures/jds/jd-1.txt \
  --target-title "Software Developer" \
  --max-achievements 7 \
  --output outputs/jd-1-plan.md \
  --json-output outputs/jd-1-plan.json
```

The JSON plan contains:

- `job_description_parse`
- `semantic_search`
- `graph_expansion`
- `ranking`
- `requirement_coverage`
- `gap_report`
- `audit`
