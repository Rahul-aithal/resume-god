"""Constrained achievement rewriting with deterministic grounding checks."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any, Protocol

from .assembly import apply_assembly, build_assembly


REWRITE_POLICY_VERSION = 1
_NUMBER = re.compile(r"(?<![\w])\d+(?:\.\d+)?(?:%|ms|s|x)?(?![\w])")
_ACRONYM = re.compile(r"(?<![A-Za-z])[A-Z][A-Z0-9+#.-]{1,}(?![A-Za-z])")
_DOT_TECH = re.compile(
    r"(?<![A-Za-z])(?:[A-Za-z][A-Za-z0-9+#.-]*\.[A-Za-z][A-Za-z0-9+#.-]*)(?![A-Za-z])"
)
_COMMON_TECH = (
    "Kubernetes", "Rust", "Spring", "Spring Boot", "Terraform", "Jenkins",
    "Kafka", "GraphQL", "Angular", "Vue", "Svelte", "MySQL", "Azure", "GCP",
    "LangChain", "OpenAI", "PyTorch", "TensorFlow", "Redux", "SASS", "Less",
)


class RewriteProvider(Protocol):
    def complete_json(self, prompt: str) -> dict[str, Any]:
        ...


def _known_terms(
    profile: dict[str, Any],
) -> dict[str, str]:
    terms: dict[str, str] = {}
    for skill in profile["skills"]:
        for term in (skill["name"], *skill.get("aliases", [])):
            terms[term.casefold()] = skill["id"]
    return terms


def _profile_skill_ids(text: str, terms: dict[str, str]) -> set[str]:
    found: set[str] = set()
    for term, skill_id in terms.items():
        pattern = re.compile(
            rf"(?<!\w){re.escape(term)}(?!\w)", re.IGNORECASE
        )
        if pattern.search(text):
            found.add(skill_id)
    return found


def _technology_tokens(text: str) -> set[str]:
    found: set[str] = set()
    found.update(_ACRONYM.findall(text))
    found.update(_DOT_TECH.findall(text))
    for value in _COMMON_TECH:
        if re.search(rf"(?<!\w){re.escape(value)}(?!\w)", text, re.IGNORECASE):
            found.add(value)
    return {value.casefold() for value in found if value}


def _numbers(text: str) -> set[str]:
    return set(_NUMBER.findall(text))


def validate_rewrite(
    source_text: str,
    rewritten_text: str,
    achievement: dict[str, Any],
    profile: dict[str, Any],
) -> tuple[bool, list[str]]:
    """Ensure a rewrite introduces no technology, skill, or numeric claim."""
    issues: list[str] = []
    if not isinstance(rewritten_text, str) or not rewritten_text.strip():
        return False, ["rewrite is empty or not text"]
    if rewritten_text != rewritten_text.strip():
        issues.append("rewrite has leading or trailing padding")

    terms = _known_terms(profile)
    source_skills = _profile_skill_ids(source_text, terms)
    rewritten_skills = _profile_skill_ids(rewritten_text, terms)
    if rewritten_skills - source_skills:
        issues.append(
            "new profile skills introduced: "
            + ", ".join(sorted(rewritten_skills - source_skills))
        )

    source_technologies = _technology_tokens(source_text)
    rewritten_technologies = _technology_tokens(rewritten_text)
    if rewritten_technologies - source_technologies:
        issues.append(
            "new technology names introduced: "
            + ", ".join(sorted(rewritten_technologies - source_technologies))
        )

    source_numbers = _numbers(source_text)
    rewritten_numbers = _numbers(rewritten_text)
    if rewritten_numbers - source_numbers:
        issues.append(
            "new numeric claims introduced: "
            + ", ".join(sorted(rewritten_numbers - source_numbers))
        )

    if len(rewritten_text) > len(source_text) + 160:
        issues.append("rewrite is too long and may contain keyword stuffing")

    expected_parent = achievement.get("part_of")
    if not expected_parent:
        issues.append("source achievement has no parent relationship")
    return not issues, issues


def _prompt(plan: dict[str, Any], bullets: list[dict[str, Any]]) -> str:
    parsed = plan.get("job_description_parse", {})
    payload = [
        {
            "achievement_id": achievement["id"],
            "source_text": achievement["text"],
        }
        for achievement in bullets
    ]
    return f"""Lightly adapt each resume bullet toward this target role.

Rules:
- Preserve every technology, number, employer, project, date, and metric.
- Do not add skills or keyword stuffing.
- Keep each bullet as one concise sentence.
- Return JSON exactly as {{"rewrites":[{{"achievement_id":"...","text":"..."}}]}}.

Target title: {plan['target_title']}
Parsed requirements: {parsed}
Bullets: {payload}"""


def rewrite_plan(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    provider: RewriteProvider | None = None,
    summary: str | None = None,
    page_budget_chars: int = 3200,
) -> dict[str, Any]:
    """Assemble selected evidence and apply validated rewrites with fallback."""
    assembly = build_assembly(
        plan,
        profile,
        page_budget_chars=page_budget_chars,
        summary=summary,
    )
    result = apply_assembly(plan, profile, assembly)
    achievements = {
        item["id"]: item for item in profile["achievements"]
    }
    selected = result["selected_achievements"]

    raw_rewrites: dict[str, str] = {}
    if provider is not None:
        response = provider.complete_json(_prompt(result, selected))
        for row in response.get("rewrites", []):
            if not isinstance(row, dict) or "achievement_id" not in row:
                continue
            achievement_id = str(row["achievement_id"])
            if achievement_id in achievements and isinstance(row.get("text"), str):
                raw_rewrites[achievement_id] = row["text"]

    records: dict[str, dict[str, Any]] = {}
    used_count = 0
    fallback_count = 0
    for achievement in selected:
        source_text = achievement["text"]
        candidate = raw_rewrites.get(achievement["id"])
        if candidate is None:
            passed = False
            issues = ["no provider rewrite supplied"]
        else:
            passed, issues = validate_rewrite(
                source_text, candidate, achievement, profile
            )
        if candidate is not None and passed:
            final_text = candidate
            status = "used"
            used_count += 1
        else:
            final_text = source_text
            status = "fallback_original"
            fallback_count += 1
        records[achievement["id"]] = {
            "source_text": source_text,
            "rewritten_text": final_text,
            "status": status,
            "used_rewrite": status == "used",
            "validation_passed": passed,
            "issues": [] if passed and candidate is not None else issues,
        }

    result["rewrites"] = records
    result["rewrite_policy_version"] = REWRITE_POLICY_VERSION
    result["rewrite_audit"] = {
        "all_rewritten_achievements_exist": all(
            item in achievements for item in records
        ),
        "every_source_text_matches_reviewed_profile": all(
            record["source_text"] == achievements[item]["text"]
            for item, record in records.items()
        ),
        "every_used_rewrite_passed_grounding_validation": all(
            record["validation_passed"]
            for record in records.values()
            if record["used_rewrite"]
        ),
        "every_failed_rewrite_falls_back_to_original": all(
            record["rewritten_text"] == record["source_text"]
            for record in records.values()
            if not record["used_rewrite"]
        ),
        "no_new_technology_or_numeric_claims": all(
            record["validation_passed"]
            for record in records.values()
            if record["used_rewrite"]
        ),
    }
    result["rewrite_summary"] = {
        "selected_achievement_count": len(records),
        "used_rewrite_count": used_count,
        "fallback_count": fallback_count,
    }
    return result
