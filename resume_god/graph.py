"""Graph and local semantic index for the reviewed master profile."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .tailor import load_profile

GRAPH_SCHEMA_VERSION = 1
_WORD = re.compile(r"[a-z0-9][a-z0-9+#._-]*", re.IGNORECASE)


def _tokenize(value: str) -> list[str]:
    return [token.casefold().strip("._-") for token in _WORD.findall(value)]


def _cosine(left: dict[str, float], right: dict[str, float]) -> float:
    if not left or not right:
        return 0.0
    dot = sum(value * right.get(token, 0.0) for token, value in left.items())
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    return dot / (left_norm * right_norm) if left_norm and right_norm else 0.0


@dataclass(frozen=True)
class SparseVector:
    values: dict[str, float]

    def as_list(self, vocabulary: dict[str, int]) -> list[float]:
        result = [0.0] * len(vocabulary)
        for token, value in self.values.items():
            result[vocabulary[token]] = value
        return result


def _tfidf_vectors(documents: list[str]) -> tuple[dict[str, int], list[SparseVector]]:
    tokenized = [_tokenize(document) for document in documents]
    document_frequency: dict[str, int] = defaultdict(int)
    for tokens in tokenized:
        for token in set(tokens):
            document_frequency[token] += 1

    vocabulary = {
        token: position
        for position, token in enumerate(sorted(document_frequency))
    }
    vectors: list[SparseVector] = []
    total = max(len(tokenized), 1)
    for tokens in tokenized:
        frequency: dict[str, int] = defaultdict(int)
        for token in tokens:
            if token in vocabulary:
                frequency[token] += 1
        values = {
            token: (count / len(tokens) if tokens else 0.0)
            * (math.log((total + 1) / (document_frequency[token] + 1)) + 1)
            for token, count in frequency.items()
        }
        vectors.append(SparseVector(values))
    return vocabulary, vectors


class ProfileGraph:
    """Queryable profile projection without requiring a database."""

    def __init__(self, profile: dict[str, Any]):
        self.profile = profile
        self.skills = {item["id"]: item for item in profile["skills"]}
        self.parents = {
            item["id"]: item
            for section in ("experiences", "projects")
            for item in profile[section]
        }
        self.achievements = {item["id"]: item for item in profile["achievements"]}
        self.parent_skills: dict[str, set[str]] = defaultdict(set)
        for achievement in profile["achievements"]:
            self.parent_skills[achievement["part_of"]].update(achievement["skills"])

        documents = []
        for achievement in profile["achievements"]:
            parent = self.parents[achievement["part_of"]]
            documents.append(
                " ".join(
                    [
                        achievement["text"],
                        parent.get("name", ""),
                        parent.get("title", ""),
                        parent.get("role", ""),
                        " ".join(
                            self.skills[item]["name"]
                            for item in achievement["skills"]
                        ),
                    ]
                )
            )
        self.vocabulary, vectors = _tfidf_vectors(documents)
        self.embeddings = dict(zip(self.achievements, vectors))

    def bullets_for_skill(self, skill_id: str) -> list[dict[str, Any]]:
        if skill_id not in self.skills:
            raise ValueError(f"Unknown skill id: {skill_id}")
        return [
            achievement
            for achievement in self.profile["achievements"]
            if skill_id in achievement["skills"]
        ]

    def skills_for_project(self, project_id: str) -> list[dict[str, Any]]:
        parent = self.parents.get(project_id)
        if parent is None or parent not in self.profile["projects"]:
            raise ValueError(f"Unknown project id: {project_id}")
        return [
            self.skills[item] for item in sorted(self.parent_skills[project_id])
        ]

    def search_bullets(self, query: str, *, limit: int = 5) -> list[dict[str, Any]]:
        if limit < 1:
            raise ValueError("limit must be at least 1")
        query_vector = self._query_vector(query)
        rows = [
            (_cosine(query_vector, vector.values), achievement_id)
            for achievement_id, vector in self.embeddings.items()
        ]
        rows.sort(key=lambda row: (-row[0], row[1]))
        return [
            {
                "achievement": self.achievements[achievement_id],
                "similarity": round(score, 8),
            }
            for score, achievement_id in rows[:limit]
            if score > 0
        ]

    def similarity(self, query: str, achievement_id: str) -> float:
        if achievement_id not in self.embeddings:
            raise ValueError(f"Unknown achievement id: {achievement_id}")
        return _cosine(
            self._query_vector(query), self.embeddings[achievement_id].values
        )

    def expand_skills(self, skill_id: str, *, hops: int = 2) -> list[dict[str, Any]]:
        if skill_id not in self.skills:
            raise ValueError(f"Unknown skill id: {skill_id}")
        if hops not in (1, 2):
            raise ValueError("hops must be 1 or 2")
        frontier = {skill_id}
        seen = {skill_id}
        for _ in range(hops):
            next_frontier: set[str] = set()
            for candidate in frontier:
                next_frontier.update(self._adjacent_skills(candidate))
            frontier = next_frontier - seen
            seen.update(frontier)
        return [self.skills[item] for item in sorted(seen - {skill_id})]

    def _adjacent_skills(self, skill_id: str) -> set[str]:
        adjacent: set[str] = set()
        for achievement in self.profile["achievements"]:
            if skill_id in achievement["skills"]:
                adjacent.update(achievement["skills"])
                adjacent.update(self.parent_skills[achievement["part_of"]])
        return adjacent

    def _query_vector(self, query: str) -> dict[str, float]:
        tokens = [token for token in _tokenize(query) if token in self.vocabulary]
        if not tokens:
            return {}
        total = len(self.profile["achievements"])
        document_frequency: dict[str, int] = defaultdict(int)
        for vector in self.embeddings.values():
            for token in vector.values:
                document_frequency[token] += 1
        frequency: dict[str, int] = defaultdict(int)
        for token in tokens:
            frequency[token] += 1
        return {
            token: (count / len(tokens))
            * (math.log((total + 1) / (document_frequency[token] + 1)) + 1)
            for token, count in frequency.items()
        }

    def export_records(self) -> dict[str, list[dict[str, Any]]]:
        """Return flat records suitable for Neo4j merge operations."""
        skills = [
            {
                "id": skill["id"],
                "name": skill["name"],
                "category": skill["category"],
                "aliases": skill.get("aliases", []),
            }
            for skill in self.profile["skills"]
        ]

        parents: list[dict[str, Any]] = []
        relationships: list[dict[str, str]] = []
        for kind, section in (
            ("Experience", "experiences"),
            ("Project", "projects"),
        ):
            for node in self.profile[section]:
                parents.append(
                    {
                        "id": node["id"],
                        "kind": kind,
                        "name": node.get("name") or node.get("role"),
                        "title": node.get("title") or node.get("role"),
                        "url": node.get("url"),
                        "date_range": json.dumps(
                            node.get("date_range"), ensure_ascii=False
                        ),
                    }
                )
                for skill_id in sorted(self.parent_skills[node["id"]]):
                    relationships.append(
                        {"from": node["id"], "to": skill_id, "type": "USES"}
                    )

        achievements: list[dict[str, Any]] = []
        for achievement in self.profile["achievements"]:
            achievements.append(
                {
                    "id": achievement["id"],
                    "text": achievement["text"],
                    "metrics": achievement.get("metrics", []),
                    "date_range": json.dumps(
                        achievement.get("date_range"), ensure_ascii=False
                    ),
                    "source": achievement.get("source", []),
                    "embedding": self.embeddings[achievement["id"]].as_list(
                        self.vocabulary
                    ),
                }
            )
            relationships.append(
                {
                    "from": achievement["id"],
                    "to": achievement["part_of"],
                    "type": "PART_OF",
                }
            )
            for skill_id in achievement["skills"]:
                relationships.append(
                    {
                        "from": achievement["id"],
                        "to": skill_id,
                        "type": "DEMONSTRATES",
                    }
                )

        education = [
            {
                "id": node["id"],
                "institution": node["institution"],
                "credential": node["credential"],
                "date_range": json.dumps(
                    node.get("date_range"), ensure_ascii=False
                ),
            }
            for node in self.profile["education"]
        ]
        certifications = [
            {
                "id": node["id"],
                "name": node["name"],
                "issuer": node["issuer"],
                "issued_on": node["issued_on"],
            }
            for node in self.profile["certifications"]
        ]
        return {
            "skills": skills,
            "parents": parents,
            "achievements": achievements,
            "education": education,
            "certifications": certifications,
            "relationships": relationships,
        }


def load_into_neo4j(
    graph: ProfileGraph,
    *,
    uri: str,
    user: str,
    password: str,
    graph_id: str = "resume-god",
) -> dict[str, int]:
    """Replace this profile projection and recreate every relationship."""
    try:
        from neo4j import GraphDatabase
    except ImportError as error:  # pragma: no cover
        raise RuntimeError(
            "The neo4j package is required. Run: uv sync"
        ) from error

    records = graph.export_records()
    dimensions = len(graph.vocabulary)
    counts: dict[str, int] = {}
    with GraphDatabase.driver(uri, auth=(user, password)) as driver:
        driver.verify_connectivity()
        with driver.session() as session:
            session.run(
                "MATCH (n:ProfileGraphItem {graph_id: $graph_id}) DETACH DELETE n",
                graph_id=graph_id,
            ).consume()
            session.run(
                """
                CREATE VECTOR INDEX achievement_embedding IF NOT EXISTS
                FOR (a:ProfileGraphItem:Achievement)
                ON (a.embedding)
                OPTIONS {
                  indexConfig: {
                    `vector.dimensions`: $dimensions,
                    `vector.similarity`: 'cosine'
                  }
                }
                """,
                dimensions=dimensions,
            ).consume()

            session.run(
                """
                UNWIND $rows AS row
                MERGE (n:ProfileGraphItem {graph_id: $graph_id, id: row.id})
                SET n:Achievement,
                    n.text = row.text,
                    n.metrics = row.metrics,
                    n.date_range = row.date_range,
                    n.source = row.source,
                    n.embedding = row.embedding
                """,
                rows=records["achievements"],
                graph_id=graph_id,
            ).consume()
            counts["achievements"] = len(records["achievements"])

            for label, rows in (
                ("Skill", records["skills"]),
                ("Parent", records["parents"]),
                ("Education", records["education"]),
                ("Certification", records["certifications"]),
            ):
                if not rows:
                    continue
                keys = sorted(set().union(*(row.keys() for row in rows)))
                assignments = ", ".join(
                    f"n.{key} = row.{key}" for key in keys if key != "id"
                )
                session.run(
                    f"""
                    UNWIND $rows AS row
                    MERGE (n:ProfileGraphItem {{graph_id: $graph_id, id: row.id}})
                    SET n:{label}, {assignments}
                    """,
                    rows=rows,
                    graph_id=graph_id,
                ).consume()
                counts[label.lower()] = len(rows)

            session.run(
                """
                UNWIND $rows AS row
                MATCH (a:ProfileGraphItem {graph_id: $graph_id, id: row.from})
                MATCH (b:ProfileGraphItem {graph_id: $graph_id, id: row.to})
                CALL apoc.create.relationship(a, row.type, {}, b) YIELD rel
                RETURN count(rel)
                """,
                rows=records["relationships"],
                graph_id=graph_id,
            ).consume()
            counts["relationships"] = len(records["relationships"])
    return counts


def _resolve_skill_id(graph: ProfileGraph, value: str) -> str:
    if value in graph.skills:
        return value
    folded = value.casefold()
    for skill in graph.skills.values():
        terms = [skill["name"], *skill.get("aliases", [])]
        if any(term.casefold() == folded for term in terms):
            return skill["id"]
    raise ValueError(f"Unknown skill: {value}")


def _print_json(value: Any) -> None:
    print(json.dumps(value, ensure_ascii=False, indent=2))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Load and query the resume graph")
    parser.add_argument("--profile", type=Path, default=Path("master_profile.yaml"))
    subparsers = parser.add_subparsers(dest="command", required=True)

    load_parser = subparsers.add_parser("load", help="Load the profile into Neo4j")
    load_parser.add_argument("--uri", default=os.environ.get("RESUME_GOD_NEO4J_URI"))
    load_parser.add_argument(
        "--user", default=os.environ.get("RESUME_GOD_NEO4J_USER", "neo4j")
    )
    load_parser.add_argument(
        "--password",
        default=os.environ.get("RESUME_GOD_NEO4J_PASSWORD"),
        help="Defaults to RESUME_GOD_NEO4J_PASSWORD",
    )
    load_parser.add_argument("--graph-id", default="resume-god")

    query_parser = subparsers.add_parser("query", help="Run offline sample queries")
    query_parser.add_argument("--skill", help="Canonical skill id, name, or alias")
    query_parser.add_argument("--project", help="Project id")
    query_parser.add_argument("--search", help="Semantic text query")
    query_parser.add_argument("--expand-skill", help="Expand a skill by graph hops")
    query_parser.add_argument("--limit", type=int, default=5)

    args = parser.parse_args(argv)
    graph = ProfileGraph(load_profile(args.profile))

    if args.command == "load":
        if not args.uri or not args.password:
            parser.error("Neo4j load requires --uri and a password")
        counts = load_into_neo4j(
            graph,
            uri=args.uri,
            user=args.user,
            password=args.password,
            graph_id=args.graph_id,
        )
        _print_json(
            {
                "status": "loaded",
                "schema_version": GRAPH_SCHEMA_VERSION,
                "counts": counts,
            }
        )
        return 0

    if args.skill:
        _print_json(graph.bullets_for_skill(_resolve_skill_id(graph, args.skill)))
    if args.project:
        _print_json(graph.skills_for_project(args.project))
    if args.search:
        _print_json(graph.search_bullets(args.search, limit=args.limit))
    if args.expand_skill:
        _print_json(
            graph.expand_skills(_resolve_skill_id(graph, args.expand_skill))
        )
    if not any((args.skill, args.project, args.search, args.expand_skill)):
        parser.error("Choose at least one query option")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
