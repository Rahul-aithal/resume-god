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


SELECTION_POLICY_VERSION = 1


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


def find_matched_skills(profile: dict[str, Any], job_description: str) -> list[dict[str, Any]]:
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


def _achievement_scores(
    achievements: list[dict[str, Any]],
    matched_skill_ids: set[str],
) -> list[dict[str, Any]]:
    scored: list[dict[str, Any]] = []
    for position, achievement in enumerate(achievements):
        direct_matches = sorted(set(achievement["skills"]) & matched_skill_ids)
        metrics = list(achievement.get("metrics", []))
        # Metrics amplify directly relevant achievements, but cannot make an
        # achievement eligible by themselves. This keeps the Phase 1 rule
        # explainable and prevents generic metric bullets from crowding out
        # target-skill evidence.
        if direct_matches:
            score = len(direct_matches) * 10 + len(metrics)
            scored.append(
                {
                    "achievement": achievement,
                    "position": position,
                    "score": score,
                    "direct_skill_matches": direct_matches,
                    "metrics": metrics,
                }
            )

    return sorted(scored, key=lambda item: (-item["score"], item["position"]))


def _select_with_skill_and_parent_coverage(
    ranked: list[dict[str, Any]],
    *,
    max_achievements: int,
) -> list[dict[str, Any]]:
    """Greedily balance direct-skill coverage and parent/node diversity.

    Skill coverage comes first so the plan represents as many explicit target
    requirements as possible. Raw achievement strength then chooses among
    candidates covering the same skill, while a parent penalty discourages many
    similar bullets from one node when another directly supported node remains
    available.
    """
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
            new_skills = len(set(row["direct_skill_matches"]) - covered_skills)
            parent_count = parent_counts[row["achievement"]["part_of"]]
            utility = (
                new_skills * 100 + row["score"] - parent_count * 15,
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
        covered_skills.update(row["direct_skill_matches"])
        parent_counts[row["achievement"]["part_of"]] += 1

    return selected


def build_tailoring_plan(
    profile: dict[str, Any],
    job_description: str,
    *,
    target_title: str,
    max_achievements: int = 10,
) -> dict[str, Any]:
    """Build a deterministic, source-auditable tailoring selection.

    An achievement is eligible only when at least one canonical skill link is
    directly matched in the job description. Supporting skills are then carried
    forward from selected achievements, never guessed from the job description.
    """
    if not job_description.strip():
        raise ValueError("Job description must not be empty")
    if not target_title.strip() or target_title != target_title.strip():
        raise ValueError("Target title must be non-empty and unpadded")
    if max_achievements < 1:
        raise ValueError("max_achievements must be at least 1")

    skills = {skill["id"]: skill for skill in profile["skills"]}
    parents = {
        node["id"]: node
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    achievements = {item["id"]: item for item in profile["achievements"]}

    matched_skills = find_matched_skills(profile, job_description)
    matched_skill_ids = {match["id"] for match in matched_skills}
    ranked = _achievement_scores(profile["achievements"], matched_skill_ids)
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
    for kind, nodes in (("experience", profile["experiences"]), ("project", profile["projects"])):
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
    audit = {
        "all_selected_achievements_exist": all(item in achievements for item in selected_ids),
        "all_selected_parents_exist": all(
            item["id"] in parents for item in selected_parents
        ),
        "every_selected_achievement_has_source_excerpt": all(
            achievement.get("source_excerpts") for achievement in selected_achievements
        ),
        "every_selected_skill_resolves": all(item in skills for item in selected_skill_ids),
        "every_selected_achievement_directly_matches_a_target_skill": all(
            set(achievement["skills"]) & matched_skill_ids
            for achievement in selected_achievements
        ),
        "achievement_text_is_unchanged": all(
            achievement == achievements[achievement["id"]]
            for achievement in selected_achievements
        ),
    }

    return {
        "version": 1,
        "phase": "tailoring_plan",
        "selection_policy_version": SELECTION_POLICY_VERSION,
        "profile": {
            "version": profile["version"],
            "status": profile["status"],
        },
        "target_title": target_title,
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
                "metrics": row["metrics"],
            }
            for row in selected_rows
        ],
        "audit": audit,
    }


def render_plan_markdown(plan: dict[str, Any], profile: dict[str, Any]) -> str:
    """Render a human-reviewable Phase 1 selection report."""
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
        "This Phase 1 artifact selects profile evidence. It does not invent,",
        "rewrite, or promote any achievement beyond the canonical profile.",
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
        lines.append("No achievements met the direct-skill eligibility rule.")
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
            "Eligibility requires a directly matched canonical skill. An eligible",
            "achievement receives 10 points per matched skill and 1 point per metric.",
            "Selection then greedily maximizes new target-skill coverage, applies that",
            "raw score, and penalizes parent nodes already represented by 15 points.",
            "",
        ]
    )
    for row in plan["ranking"]:
        matches = ", ".join(skills[item]["name"] for item in row["direct_skill_matches"])
        lines.append(
            f"- `{row['achievement_id']}` — score {row['score']}; matches: {matches}"
        )

    lines.append("")
    return "\n".join(lines)
