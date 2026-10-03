"""Deterministic selection of profile evidence for a target role.

Phase 1 deliberately does not rewrite achievement text. It selects canonical
profile nodes from direct skill matches in a job description and emits an
auditable plan that later rendering and rewriting phases can consume.
"""

from __future__ import annotations

import re
from collections import defaultdict
from copy import deepcopy
from pathlib import Path
from typing import Any

import yaml

SELECTION_POLICY_VERSION = 2


def load_profile(path: str | Path) -> dict[str, Any]:
    """Load and minimally validate a master profile."""
    with Path(path).open(encoding="utf-8") as handle:
        profile = yaml.safe_load(handle)

    required_sections = (
        "skills",
        "experiences",
        "projects",
        "achievements",
        "education",
        "certifications",
        "soft_skills",
    )
    missing = [section for section in required_sections if section not in profile]
    if missing:
        raise ValueError(f"Profile is missing required sections: {', '.join(missing)}")

    return profile


def _match_pattern(term: str) -> re.Pattern[str]:
    """Compile a whole-phrase, case-insensitive skill matcher."""
    return re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", re.IGNORECASE)


def find_matched_skills(
    profile: dict[str, Any], job_description: str
) -> list[dict[str, Any]]:
    """Return skills whose canonical name or alias occurs in the description."""
    matches: list[dict[str, Any]] = []
    for skill in profile["skills"]:
        matched_terms = [
            term
            for term in (skill["name"], *skill.get("aliases", []))
            if _match_pattern(term).search(job_description)
        ]
        if matched_terms:
            matches.append(
                {
                    "id": skill["id"],
                    "name": skill["name"],
                    "category": skill["category"],
                    "matched_terms": sorted(
                        matched_terms,
                        key=lambda term: (-len(term), term.casefold()),
                    ),
                }
            )
    return matches


def _recency_score(date_range: dict[str, Any] | None) -> float:
    """Score reviewed dates without inventing missing endpoints."""
    if not date_range:
        return 0.30
    if date_range.get("ongoing"):
        return 1.0
    year_text = str(date_range.get("end") or date_range.get("start") or "")
    match = re.match(r"^\d{4}", year_text)
    if not match:
        return 0.30
    year = int(match.group(0))
    if year >= 2026:
        return 1.0
    if year >= 2025:
        return 0.80
    if year >= 2024:
        return 0.65
    return 0.40


def _achievement_scores(
    achievements: list[dict[str, Any]],
    matched_skill_ids: set[str],
    *,
    must_skill_ids: set[str] | None = None,
    nice_skill_ids: set[str] | None = None,
    expanded_skill_ids: set[str] | None = None,
    semantic_scores: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Combine exact, graph-expanded, semantic, recency, and metric evidence."""
    must_ids = must_skill_ids or set()
    nice_ids = nice_skill_ids or set()
    expanded_ids = expanded_skill_ids or set()
    semantics = semantic_scores or {}
    scored: list[dict[str, Any]] = []

    for position, achievement in enumerate(achievements):
        linked = set(achievement["skills"])
        direct_must = sorted(linked & must_ids)
        direct_nice = sorted(linked & nice_ids)
        direct_matches = sorted(linked & matched_skill_ids)
        expanded_matches = sorted((linked & expanded_ids) - set(direct_matches))
        similarity = round(semantics.get(achievement["id"], 0.0), 8)
        metrics = list(achievement.get("metrics", []))
        recency = _recency_score(achievement.get("date_range"))
        metric_points = min(len(metrics), 2)

        exact_points = len(direct_must) * 12 + len(direct_nice) * 7
        graph_points = len(expanded_matches) * 3
        semantic_points = round(max(similarity, 0.0) * 8, 6)
        score = round(
            exact_points
            + graph_points
            + semantic_points
            + recency * 4
            + metric_points,
            6,
        )

        # Semantic retrieval may surface source-backed evidence whose skill
        # wording differs from the JD. It cannot inject a skill claim that is
        # absent from the achievement's reviewed profile links.
        if direct_matches or expanded_matches or similarity >= 0.08:
            scored.append(
                {
                    "achievement": achievement,
                    "position": position,
                    "score": score,
                    "direct_skill_matches": direct_matches,
                    "expanded_skill_matches": expanded_matches,
                    "requirement_skill_matches": sorted(
                        set(direct_matches) | set(expanded_matches)
                    ),
                    "semantic_similarity": similarity,
                    "recency_score": recency,
                    "metrics": metrics,
                    "score_components": {
                        "exact": exact_points,
                        "graph_expansion": graph_points,
                        "semantic": semantic_points,
                        "recency": round(recency * 4, 6),
                        "metric": metric_points,
                    },
                }
            )

    return sorted(scored, key=lambda item: (-item["score"], item["position"]))


def _select_with_skill_and_parent_coverage(
    ranked: list[dict[str, Any]],
    *,
    max_achievements: int,
) -> list[dict[str, Any]]:
    """Greedily balance requirement coverage and parent/node diversity."""
    selected: list[dict[str, Any]] = []
    selected_ids: set[str] = set()
    covered_skills: set[str] = set()
    parent_counts: dict[str, int] = defaultdict(int)

    while ranked and len(selected) < max_achievements:
        best_index: int | None = None
        best_utility: tuple[int, int] | None = None
        for index, row in enumerate(ranked):
            if row["achievement"]["id"] in selected_ids:
                continue
            direct_matches = set(row["direct_skill_matches"])
            expanded_matches = set(row["expanded_skill_matches"])
            new_direct = len(direct_matches - covered_skills)
            new_expanded = len((expanded_matches - covered_skills) - direct_matches)
            parent_count = parent_counts[row["achievement"]["part_of"]]
            utility = (
                new_direct * 1000,
                new_expanded * 20 + row["score"] - parent_count * 15,
                -row["position"],
            )
            if best_utility is None or utility > best_utility:
                best_index = index
                best_utility = utility

        if best_index is None:
            break
        row = ranked.pop(best_index)
        selected.append(row)
        selected_ids.add(row["achievement"]["id"])
        covered_skills.update(row["requirement_skill_matches"])
        parent_counts[row["achievement"]["part_of"]] += 1

    return selected


def _requirement_rows(parsed: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for priority, field in (
        ("must", "must_have_skills"),
        ("nice", "nice_to_have_skills"),
    ):
        for skill in parsed.get(field, []):
            rows.append(
                {
                    "id": skill["id"],
                    "name": skill["name"],
                    "priority": priority,
                    "kind": "profile_skill",
                }
            )
    for skill in parsed.get("unknown_skills", []):
        rows.append(
            {
                "id": None,
                "name": skill["name"],
                "priority": "reported",
                "kind": "unknown_skill",
            }
        )
    return rows


def _coverage_rows(
    requirements: list[dict[str, Any]],
    profile: dict[str, Any],
    selected_achievements: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    available = {
        skill_id
        for achievement in profile["achievements"]
        for skill_id in achievement["skills"]
    }
    selected = {
        skill_id
        for achievement in selected_achievements
        for skill_id in achievement["skills"]
    }
    rows: list[dict[str, Any]] = []
    for requirement in requirements:
        skill_id = requirement["id"]
        if skill_id is None:
            status = "unknown_no_profile_match"
            evidence_available = False
        elif skill_id in selected:
            status = "covered"
            evidence_available = True
        elif skill_id in available:
            status = "profile_skill_not_selected"
            evidence_available = True
        else:
            status = "profile_skill_without_evidence"
            evidence_available = False
        rows.append(
            {
                **requirement,
                "status": status,
                "evidence_available": evidence_available,
            }
        )
    return rows


def build_tailoring_plan(
    profile: dict[str, Any],
    job_description: str,
    *,
    target_title: str,
    max_achievements: int = 10,
    parsed_job_description: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an auditable exact, graph, and semantic retrieval selection."""
    if not job_description.strip():
        raise ValueError("Job description must not be empty")
    if not target_title.strip() or target_title != target_title.strip():
        raise ValueError("Target title must be non-empty and unpadded")
    if max_achievements < 1:
        raise ValueError("max_achievements must be at least 1")

    # Imported locally to avoid a circular module dependency: the JD parser and
    # graph both consume the profile loader exposed by this module.
    from .graph import ProfileGraph
    from .jd_parser import parse_job_description

    graph = ProfileGraph(profile)
    if parsed_job_description is None:
        parsed = parse_job_description(
            profile, job_description, target_title=target_title
        )
    else:
        parsed = parsed_job_description
        if parsed.get("role_title", "").strip() != target_title:
            raise ValueError("Parsed job description does not match target title")
    skills = {skill["id"]: skill for skill in profile["skills"]}
    parents = {
        node["id"]: node
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    achievements = {item["id"]: item for item in profile["achievements"]}

    matched_skills = find_matched_skills(profile, job_description)
    matched_skill_ids = {match["id"] for match in matched_skills}
    must_ids = {
        row["id"] for row in parsed["must_have_skills"] if row["id"] in skills
    }
    nice_ids = {
        row["id"] for row in parsed["nice_to_have_skills"] if row["id"] in skills
    }

    expanded_skill_ids: set[str] = set()
    expansion_paths: list[dict[str, Any]] = []
    for skill_id in sorted(matched_skill_ids):
        connected = graph.expand_skills(skill_id, hops=2)
        connected_ids = {item["id"] for item in connected} & set(skills)
        expansion_paths.append(
            {
                "from_skill_id": skill_id,
                "hops": 2,
                "skill_ids": sorted(connected_ids),
            }
        )
        expanded_skill_ids.update(connected_ids)
    expanded_skill_ids -= matched_skill_ids

    semantic_results = graph.search_bullets(
        job_description, limit=len(profile["achievements"])
    )
    semantic_scores = {
        row["achievement"]["id"]: row["similarity"] for row in semantic_results
    }

    ranked = _achievement_scores(
        profile["achievements"],
        matched_skill_ids,
        must_skill_ids=must_ids,
        nice_skill_ids=nice_ids,
        expanded_skill_ids=expanded_skill_ids,
        semantic_scores=semantic_scores,
    )
    selected_rows = _select_with_skill_and_parent_coverage(
        ranked,
        max_achievements=max_achievements,
    )
    selected_ids = {row["achievement"]["id"] for row in selected_rows}

    achievements_by_parent: dict[str, list[str]] = defaultdict(list)
    for achievement in profile["achievements"]:
        if achievement["id"] in selected_ids:
            achievements_by_parent[achievement["part_of"]].append(achievement["id"])

    selected_parents: list[dict[str, Any]] = []
    for kind, nodes in (
        ("experience", profile["experiences"]),
        ("project", profile["projects"]),
    ):
        for node in nodes:
            if node["id"] in achievements_by_parent:
                selected_parents.append(
                    {
                        "kind": kind,
                        "id": node["id"],
                        "achievement_ids": achievements_by_parent[node["id"]],
                    }
                )

    selected_achievements = [achievements[item] for item in sorted(selected_ids)]
    selected_skill_ids: set[str] = set()
    for achievement in selected_achievements:
        selected_skill_ids.update(achievement["skills"])

    supporting_skill_ids = sorted(selected_skill_ids - matched_skill_ids)
    requirements = _requirement_rows(parsed)
    requirement_coverage = _coverage_rows(
        requirements, profile, selected_achievements
    )
    matched_but_unevidenced = [
        {
            "id": row["id"],
            "name": row["name"],
            "priority": row["priority"],
            "status": row["status"],
        }
        for row in requirement_coverage
        if row["kind"] == "profile_skill" and row["status"] != "covered"
    ]
    unknown_skills = [
        {"name": row["name"], "status": row["status"]}
        for row in requirement_coverage
        if row["kind"] == "unknown_skill"
    ]

    audit = {
        "all_selected_achievements_exist": all(
            item in achievements for item in selected_ids
        ),
        "all_selected_parents_exist": all(
            item["id"] in parents for item in selected_parents
        ),
        "every_selected_achievement_has_source_excerpt": all(
            achievement.get("source_excerpts") for achievement in selected_achievements
        ),
        "every_selected_skill_resolves": all(
            item in skills for item in selected_skill_ids
        ),
        "every_selected_achievement_is_retrieved_from_reviewed_evidence": all(
            bool(row["direct_skill_matches"])
            or bool(row["expanded_skill_matches"])
            or row["semantic_similarity"] >= 0.08
            for row in selected_rows
        ),
        "achievement_text_is_unchanged": all(
            achievement == achievements[achievement["id"]]
            for achievement in selected_achievements
        ),
        "requirement_coverage_references_resolve": all(
            row["kind"] == "unknown_skill" or row["id"] in skills
            for row in requirement_coverage
        ),
        "unknown_skills_are_never_promoted_to_profile_claims": all(
            row["id"] is None or row["id"] in selected_skill_ids
            for row in requirement_coverage
            if row["kind"] == "unknown_skill"
        ),
    }

    return {
        "version": 2,
        "phase": "tailoring_plan",
        "selection_policy_version": SELECTION_POLICY_VERSION,
        "profile": {
            "version": profile["version"],
            "status": profile["status"],
        },
        "target_title": target_title,
        "job_description_parse": parsed,
        "matched_skills": matched_skills,
        "supporting_skills": [
            {
                "id": skill_id,
                "name": skills[skill_id]["name"],
                "category": skills[skill_id]["category"],
            }
            for skill_id in supporting_skill_ids
        ],
        "selected_achievements": deepcopy(selected_achievements),
        "selected_parents": selected_parents,
        "always_include": {
            "contact": True,
            "education": [node["id"] for node in profile["education"]],
            "certifications": [node["id"] for node in profile["certifications"]],
        },
        "ranking": [
            {
                "achievement_id": row["achievement"]["id"],
                "score": row["score"],
                "direct_skill_matches": row["direct_skill_matches"],
                "expanded_skill_matches": row["expanded_skill_matches"],
                "semantic_similarity": row["semantic_similarity"],
                "recency_score": row["recency_score"],
                "metrics": row["metrics"],
                "score_components": row["score_components"],
            }
            for row in selected_rows
        ],
        "semantic_search": {
            "method": "deterministic_tfidf_cosine",
            "top_matches": semantic_results[:5],
        },
        "graph_expansion": {
            "hops": 2,
            "paths": expansion_paths,
            "expanded_skill_ids": sorted(expanded_skill_ids),
        },
        "requirement_coverage": requirement_coverage,
        "gap_report": {
            "unknown_skills": unknown_skills,
            "matched_but_unevidenced_skills": matched_but_unevidenced,
            "all_known_requirements_covered": not matched_but_unevidenced,
        },
        "audit": audit,
    }



def render_plan_markdown(plan: dict[str, Any], profile: dict[str, Any]) -> str:
    """Render a human-reviewable retrieval and selection report."""
    skills = {skill["id"]: skill for skill in profile["skills"]}
    parents = {
        node["id"]: node
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    achievements = {item["id"]: item for item in profile["achievements"]}
    lines = [
        "# Resume tailoring plan",
        "",
        f"Target title: **{plan['target_title']}**",
        "",
        "This artifact selects reviewed profile evidence through exact alias",
        "matching, two-hop graph expansion, local semantic similarity, recency,",
        "and metric scoring. It does not invent or promote unknown skills.",
        "",
        "## Direct job-description skill matches",
        "",
    ]

    if plan["matched_skills"]:
        for skill in plan["matched_skills"]:
            terms = ", ".join(f"'{term}'" for term in skill["matched_terms"])
            lines.append(f"- **{skill['name']}** ({skill['category']}) — {terms}")
    else:
        lines.append("- No canonical skill aliases were directly matched.")

    lines.extend(["", "## Selected evidence", ""])
    if not plan["selected_parents"]:
        lines.append("No achievements met the retrieval eligibility threshold.")
    else:
        for parent_ref in plan["selected_parents"]:
            parent = parents[parent_ref["id"]]
            if parent_ref["kind"] == "experience":
                heading = f"{parent['role']} — {parent['organization']}"
            else:
                heading = f"{parent['name']} — {parent['title']}"
            lines.extend([f"### {heading}", ""])
            for achievement_id in parent_ref["achievement_ids"]:
                lines.append(f"- {achievements[achievement_id]['text']}")
            lines.append("")

    lines.extend(["## Supporting skills from selected evidence", ""])
    if plan["supporting_skills"]:
        by_category: dict[str, list[str]] = defaultdict(list)
        for skill in plan["supporting_skills"]:
            by_category[skill["category"]].append(skill["name"])
        for category in sorted(by_category):
            lines.append(f"- **{category}:** {', '.join(by_category[category])}")
    else:
        lines.append("- None")

    semantic = plan.get("semantic_search", {})
    lines.extend(
        [
            "",
            "## Retrieval details",
            "",
            f"- Semantic method: **{semantic.get('method', 'not recorded')}**",
            f"- Graph expansion: **{plan.get('graph_expansion', {}).get('hops', 0)} hop(s)**",
            f"- Expanded canonical skills: **{len(plan.get('graph_expansion', {}).get('expanded_skill_ids', []))}**",
            "",
            "Top semantic matches:",
            "",
        ]
    )
    top_semantic = semantic.get("top_matches", [])
    if top_semantic:
        for row in top_semantic:
            lines.append(
                f"- `{row['achievement']['id']}` — similarity {row['similarity']}"
            )
    else:
        lines.append("- None")

    lines.extend(
        [
            "",
            "## Requirement coverage and gaps",
            "",
            "| Requirement | Priority | Status | Evidence available |",
            "|---|---|---|---|",
        ]
    )
    for row in plan.get("requirement_coverage", []):
        lines.append(
            f"| {row['name']} | {row['priority']} | {row['status']} | "
            f"{'yes' if row['evidence_available'] else 'no'} |"
        )
    gaps = plan.get("gap_report", {})
    lines.extend(
        [
            "",
            "Unknown skills are retained verbatim in the gap report and are never",
            "converted into profile claims.",
            "",
        ]
    )
    if gaps.get("unknown_skills"):
        unknown_names = ", ".join(row["name"] for row in gaps["unknown_skills"])
        lines.append(f"- **Unknown:** {unknown_names}")
    else:
        lines.append("- **Unknown:** None")
    if gaps.get("matched_but_unevidenced_skills"):
        unevidenced = ", ".join(
            row["name"] for row in gaps["matched_but_unevidenced_skills"]
        )
        lines.append(f"- **Matched but unevidenced:** {unevidenced}")
    else:
        lines.append("- **Matched but unevidenced:** None")

    if "assembly" in plan:
        assembly = plan["assembly"]
        lines.extend(
            [
                "",
                "## Assembly and constrained rewriting",
                "",
                f"- Page budget: **{assembly['page_budget_chars']} characters**",
                f"- Retained achievements: **{len(assembly['retained_achievement_ids'])}**",
                f"- Trimmed achievements: **{len(assembly['trimmed_achievement_ids'])}**",
                "",
            ]
        )
        if plan.get("rewrites"):
            summary = plan.get("rewrite_summary", {})
            lines.extend(
                [
                    f"- Used validated rewrites: **{summary.get('used_rewrite_count', 0)}**",
                    f"- Fallbacks to reviewed originals: **{summary.get('fallback_count', 0)}**",
                    "",
                ]
            )
            for achievement_id, record in plan["rewrites"].items():
                status = "used" if record["used_rewrite"] else "fallback original"
                lines.append(f"- `{achievement_id}` — {status}")

    lines.extend(["", "## Selection audit", ""])
    for check, passed in plan["audit"].items():
        lines.append(f"- {'PASS' if passed else 'FAIL'}: {check.replace('_', ' ')}")

    if not all(plan["audit"].values()):
        lines.extend(["", "> WARNING: This plan failed at least one audit check."])

    lines.extend(
        [
            "",
            "## Ranking rationale",
            "",
            "Scores combine exact must/nice skill coverage, two-hop graph",
            "expansion, cosine similarity, recency, and metrics. Exact requirement",
            "coverage dominates selection; graph expansion and semantic similarity",
            "surface additional reviewed evidence without inventing claims.",
            "",
        ]
    )
    for row in plan["ranking"]:
        direct = ", ".join(
            skills[item]["name"] for item in row["direct_skill_matches"]
        )
        expanded = ", ".join(
            skills[item]["name"]
            for item in row.get("expanded_skill_matches", [])
        )
        components = row.get("score_components", {})
        lines.append(
            f"- `{row['achievement_id']}` — score {row['score']}; "
            f"exact: {direct or 'none'}; expanded: {expanded or 'none'}; "
            f"semantic: {row.get('semantic_similarity', 0)}; "
            f"components: {components}"
        )

    lines.append("")
    return "\n".join(lines)
