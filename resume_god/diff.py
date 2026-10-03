"""Skill-diff presenter: what the JD expects vs what the profile evidences.

Builds on the existing Phase-1 requirement_coverage rows. Never invents
skills — unknown JD terms stay in the gap column verbatim.
"""

from __future__ import annotations

from typing import Any


def build_skill_diff(
    plan: dict[str, Any], profile: dict[str, Any]
) -> dict[str, Any]:
    skills = {skill["id"]: skill for skill in profile.get("skills", [])}
    rows = plan.get("requirement_coverage", [])
    have: list[dict[str, Any]] = []
    inferred: list[dict[str, Any]] = []
    partial: list[dict[str, Any]] = []
    missing: list[dict[str, Any]] = []
    unknown: list[dict[str, Any]] = []

    for row in rows:
        entry = {
            "name": row.get("name", ""),
            "priority": row.get("priority", ""),
            "status": row.get("status", ""),
            "evidence_available": bool(row.get("evidence_available", False)),
        }
        kind = row.get("kind")
        status = row.get("status")
        if kind == "unknown_skill":
            unknown.append(entry)
        elif status == "covered":
            have.append(entry)
        elif status in ("inferred_covered", "inferred_available_not_selected"):
            # Framework-implies-foundation evidence (e.g. React.js work
            # implies JavaScript exposure). Weaker than direct evidence and
            # always labeled as inferred.
            inferred.append(entry)
        elif status == "profile_skill_not_selected":
            # Skill exists in profile with evidence elsewhere, but the
            # tailoring plan did not select it for this resume.
            partial.append(entry)
        else:  # profile_skill_without_evidence
            missing.append(entry)

    total = len([row for row in rows if row.get("kind") == "profile_skill"])
    return {
        "target_title": plan.get("target_title", ""),
        "summary": (
            f"To join as {plan.get('target_title', 'this role')} they expect "
            f"{total} known skill(s); you have evidence for {len(have)}, "
            f"inferred {len(inferred)}, partial/not-selected {len(partial)}, "
            f"missing {len(missing)}, unknown {len(unknown)}."
        ),
        "have": have,
        "inferred": inferred,
        "partial_or_not_selected": partial,
        "missing_no_evidence": missing,
        "unknown_jd_terms": unknown,
        "counts": {
            "expected_known": total,
            "have": len(have),
            "inferred": len(inferred),
            "partial": len(partial),
            "missing": len(missing),
            "unknown": len(unknown),
        },
    }


def render_skill_diff_markdown(diff: dict[str, Any]) -> str:
    lines = [
        "## Skill diff — what they expect vs your evidence",
        "",
        diff["summary"],
        "",
        "| JD expects | Priority | You have | Status |",
        "|---|---|---|---|",
    ]

    def _row(name: str, priority: str, have_label: str, status: str) -> str:
        return f"| {name} | {priority} | {have_label} | {status} |"

    for row in diff["have"]:
        lines.append(_row(row["name"], row["priority"], "yes — selected", "covered"))
    for row in diff.get("inferred", []):
        lines.append(
            _row(row["name"], row["priority"], "inferred via framework", row["status"])
        )
    for row in diff["partial_or_not_selected"]:
        lines.append(
            _row(row["name"], row["priority"], "in profile, not in this resume", row["status"])
        )
    for row in diff["missing_no_evidence"]:
        lines.append(_row(row["name"], row["priority"], "no", row["status"]))
    for row in diff["unknown_jd_terms"]:
        lines.append(_row(row["name"], row["priority"], "no — unknown term", row["status"]))
    if not (diff["have"] or diff.get("inferred") or diff["partial_or_not_selected"] or diff["missing_no_evidence"] or diff["unknown_jd_terms"]):
        lines.append("| — | — | — | no requirements parsed |")
    lines.append("")
    lines.append(
        "Gaps must not be added to a resume without a new user-reviewed "
        "profile fact."
    )
    lines.append("")
    return "\n".join(lines)


def skill_diff_for_role(
    jd_text: str,
    profile: dict[str, Any],
    *,
    target_title: str,
    max_achievements: int = 10,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Convenience: build a tailoring plan then diff it (offline path)."""
    from .tailor import build_tailoring_plan

    plan = build_tailoring_plan(
        profile,
        jd_text,
        target_title=target_title,
        max_achievements=max_achievements,
    )
    return plan, build_skill_diff(plan, profile)
