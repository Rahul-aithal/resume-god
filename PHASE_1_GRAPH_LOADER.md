# Original Phase 1: graph schema and loader

## Status

Implemented.

The reviewed master profile is projected into an offline `ProfileGraph` and, when
connection settings are supplied, a local Neo4j graph.

## Schema

Nodes: `Skill`, `Experience`, `Project`, `Achievement`, `Education`, and
`Certification`.

Relationships:

- `Project -USES-> Skill`
- `Experience -USES-> Skill`
- `Achievement -PART_OF-> Project|Experience`
- `Achievement -DEMONSTRATES-> Skill`

Every achievement stores a deterministic local TF-IDF embedding. Neo4j loading
also creates a cosine vector index. The profile remains the durable source of
truth; deleting the Neo4j volume never loses resume facts.

## Local Neo4j

```bash
docker compose up -d neo4j

uv run python -m resume_god.graph load \
  --profile master_profile.yaml \
  --uri bolt://localhost:7687 \
  --user neo4j \
  --password resume-god-local
```

Loading replaces only the `resume-god` projection. Re-running it does not
duplicate nodes or relationships.

## Offline sample queries

```bash
uv run python -m resume_god.graph query \
  --skill Go \
  --project project_eventmcp \
  --search "LLM agent calendar tool" \
  --limit 5
```
