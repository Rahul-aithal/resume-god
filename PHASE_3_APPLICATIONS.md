# Application packets: deterministic multi-role batches

## Purpose

Phase 3 application packets turn a manifest into one auditable packet per role.
Each packet contains the plan, machine-readable plan, Markdown resume, and HTML
resume. With `--pdf`, it also contains a one-page Typst PDF. The batch index
shows evidence coverage across every application.

The implementation is in `resume_god/applications.py`. The current application
manifest is `applications.yaml`.

## Safety rules

- Every packet reuses the reviewed master profile; Phase 3 adds no profile facts.
- Every packet reuses the Phase 1 eligibility and audit rules.
- Every packet reuses constrained assembly, grounding validation, and rendering checks.
- Application summaries remain optional. Without one, Phase 2 generates the
  deterministic evidence-based summary.
- The index explicitly lists target skills that matched the job description but
  have no selected evidence. Those skills are gaps, not resume claims.
- Text and PDF artifacts are generated before the output directory is changed.
  A malformed application cannot leave a partially written batch.

## Manifest format

Each application has a lowercase hyphenated `id`, company, target title, path to
a UTF-8 job description, and optional achievement limit and reviewed summary.
Job-description paths resolve relative to the manifest.

```yaml
version: 1
defaults:
  max_achievements: 7
applications:
  - id: example-product-engineer
    company: Example Company
    target_title: Product Engineer
    job_description_file: fixtures/jds/example.txt
```

## Usage

Build the four currently configured packets:

```bash
uv run python -m resume_god.applications \
  --manifest applications.yaml \
  --output-dir outputs/applications
```

Also produce one one-page Typst PDF per packet:

```bash
uv run python -m resume_god.applications \
  --manifest applications.yaml \
  --output-dir outputs/applications \
  --pdf
```

Open `outputs/applications/index.md` first. It links to every HTML resume and
shows which direct job-description skills lack selected profile evidence.

## Acceptance checks

```bash
uv run python -m unittest discover -s tests -v
```

Packet tests verify manifest validation, packet generation, relative paths,
custom summaries, evidence gaps, optional one-page PDFs, atomic batch failure,
and the command-line entry point.
