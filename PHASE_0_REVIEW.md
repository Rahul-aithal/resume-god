# Phase 0 review: master profile

## Review outcome

The profile was reviewed with Rahul on **2026-09-25**. The profile status is now
`user_reviewed`, all eight merge conflicts are resolved, and the user review is
recorded as the source `user_review_2026_09_25`.

The reviewed master profile is in **`master_profile.yaml`**. It contains:

- 66 canonical skills with editable aliases
- 3 experience nodes
- 6 project nodes
- 41 atomic, user-reviewed achievement bullets
- 1 education node
- 1 dated certification node
- Source-resolved soft-skill evidence where both source variants remain valid
- A source excerpt for every retained achievement, so Phase 0 tests can verify
  that each resume-derived fact occurred in one of the supplied PDFs

The two original summaries remain stored verbatim as tailored narratives, not
canonical facts. Later resume phases must generate a role-specific summary from
selected profile facts instead of always reusing one source summary.

## User review decisions applied

### C-001 — EventMCP subtitle

**Resolution:** `LLM-Integrated Calendar MCP Server` is canonical. The AI
Automation subtitle, `LLM Agent Calendar Automation Server`, remains an
alternate title.

### C-002 — Pragya AI pipeline specificity

**Resolution:** Rahul confirmed both specifics. The profile retains structured
output formats, PII stripping, the approximately 60% post-processing effort
reduction, and the 3+ business workflow scope.

### C-003 — Vaultr release wording

**Resolution:** rejected and removed. Rahul did not recognize the count of eight
versioned releases/builds and considers the numbered claim unsafe. The profile
does not retain the count or the release achievement derived from it. Other
CI/CD facts remain independently supported by their own source excerpts.

### C-004 — Vaultr expiry wording

**Resolution:** Rahul confirmed that both expiry dates and download limits exist.
The canonical wording is `configurable expiry dates and download limits`.

### C-005 — Fast Learner supporting examples

**Resolution:** retain both source variants. This allows later phases to select
MCP, Go, LLM tooling, and HTMX for automation-oriented resumes, or Next.js,
TanStack, LLM tooling, Go, and microservices for full-stack resumes.

### C-006 — Ownership-Driven wording and scope

**Resolution:** corrected. Solo production-feature ownership applies to the
Pragya Cyber Ltd. internship. Work at XParth Technologies is team-based and is
not represented as solo work.

### C-007 — Collaborative supporting evidence

**Resolution:** retain HashVault technical leadership and describe XParth
collaboration at a safe level: Rahul works collaboratively with the team. No
additional undisclosed XParth implementation detail is inferred.

### C-008 — Canonical summary strategy

**Resolution:** confirmed. Later phases generate tailored summaries from
selected profile facts rather than reusing one of the two source summaries
unchanged.

## Additional user-reviewed facts

- HashVault Tech Lead is **ongoing**. The initial review could not establish
  its start month. On **2026-10-01**, Rahul supplied that month: the role runs
  from **October 2024 to the present**, represented as `start: 2024-10`,
  `end: null`, and `ongoing: true`.
- The Learning Management System is historical and years old. Its exact dates
  remain unknown and are intentionally not inferred. Rahul confirmed on
  **2026-10-01** to leave its dates unrecorded because the work lasted one
  month at most; the source-backed achievement already records **under 30
  days**.
- MongoDB Certified Developer was issued on **2025-03-03**. The normalized
  certification month is **2025-03**.

## Remaining review gaps

None. The Learning Management System date remains intentionally unrecorded,
but its reviewed duration is bounded at one month and is no longer treated as a
pending review gap.

## Acceptance checks

Run:

```bash
uv run python -m unittest discover -s tests -v
```

The Phase 0 tests verify profile structure, unique IDs, valid relationship and
source references, date format, alias uniqueness, contact hyperlinks, applied
user-review corrections, absence of the rejected Vaultr count, and that every
resume-derived source excerpt occurs verbatim in its identified PDF after
whitespace normalization.
