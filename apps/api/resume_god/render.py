"""Safe rendering of a Phase 1 plan into resume artifacts.

Phase 2 intentionally renders reviewed profile facts without rewriting them. A
resume can use a caller-supplied summary or a conservative, deterministic
summary of the selected evidence, but it cannot promote unsupported skills or
invent new accomplishments.
"""

from __future__ import annotations

import html
from collections import Counter
from typing import Any


MONTHS = (
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
)


def _selected_achievement_map(
    plan: dict[str, Any], profile: dict[str, Any]
) -> dict[str, dict[str, Any]]:
    """Return selected profile achievements after validating their IDs."""
    profile_achievements = {item["id"]: item for item in profile["achievements"]}
    missing = [
        item["id"]
        for item in plan.get("selected_achievements", [])
        if item["id"] not in profile_achievements
    ]
    if missing:
        raise ValueError(f"Plan references unknown achievements: {', '.join(missing)}")
    return profile_achievements


def _validate_resume_inputs(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    summary: str | None,
) -> None:
    if plan.get("phase") != "tailoring_plan":
        raise ValueError("Expected a Phase 1 tailoring plan")
    if not all(plan.get("audit", {}).values()):
        raise ValueError("Cannot render a resume from a plan with failed audit checks")
    if profile.get("status") != "user_reviewed":
        raise ValueError("Cannot render a resume from an unreviewed profile")
    if summary is not None and (
        not summary.strip() or summary != summary.strip()
    ):
        raise ValueError("Custom summary must be non-empty and unpadded")

    achievements = _selected_achievement_map(plan, profile)
    changed_achievements = [
        item["id"]
        for item in plan.get("selected_achievements", [])
        if item != achievements[item["id"]]
    ]
    if changed_achievements:
        raise ValueError(
            "Cannot render achievements that differ from the reviewed profile: "
            + ", ".join(changed_achievements)
        )

    parent_ids = {
        node["id"]
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    unknown_parents = [
        item["id"]
        for item in plan.get("selected_parents", [])
        if item.get("id") not in parent_ids
    ]
    if unknown_parents:
        raise ValueError(
            f"Plan references unknown experience/project nodes: {', '.join(unknown_parents)}"
        )
    parent_kind_by_id = {
        node["id"]: "experience" for node in profile["experiences"]
    }
    parent_kind_by_id.update(
        {node["id"]: "project" for node in profile["projects"]}
    )
    for reference in plan.get("selected_parents", []):
        expected_kind = parent_kind_by_id.get(reference.get("id"))
        if reference.get("kind") != expected_kind:
            raise ValueError("Plan experience/project kind does not match the profile")
        unknown_achievement_refs = [
            achievement_id
            for achievement_id in reference.get("achievement_ids", [])
            if achievement_id not in achievements
        ]
        if unknown_achievement_refs:
            raise ValueError(
                "Plan parent references unknown achievements: "
                + ", ".join(unknown_achievement_refs)
            )

    rewrite_audit = plan.get("rewrite_audit")
    if rewrite_audit is not None and not all(rewrite_audit.values()):
        raise ValueError("Cannot render a plan with failed rewrite audit checks")
    for achievement_id, record in plan.get("rewrites", {}).items():
        if achievement_id not in achievements:
            raise ValueError(f"Rewrite references unknown achievement: {achievement_id}")
        if record.get("source_text") != achievements[achievement_id]["text"]:
            raise ValueError(
                f"Rewrite source differs from reviewed profile: {achievement_id}"
            )
        if record.get("used_rewrite") and not record.get("validation_passed"):
            raise ValueError(
                f"Used rewrite failed grounding validation: {achievement_id}"
            )


def _format_month(value: str) -> str:
    year, month = value.split("-", 1)
    return f"{MONTHS[int(month) - 1]} {year}"


def _format_date_range(date_range: dict[str, Any] | None) -> str | None:
    """Format supported profile dates without inventing missing endpoints."""
    if not date_range:
        return None

    precision = date_range.get("precision")
    if precision == "month":
        start = (
            _format_month(date_range["start"]) if date_range.get("start") else None
        )
        end = (
            _format_month(date_range["end"])
            if date_range.get("end")
            else "Present"
            if date_range.get("ongoing")
            else None
        )
    elif precision == "year":
        start = str(date_range["start"]) if date_range.get("start") else None
        end = (
            str(date_range["end"])
            if date_range.get("end")
            else "Present"
            if date_range.get("ongoing")
            else None
        )
    else:
        return None

    if date_range.get("expected"):
        return f"Expected {end}"
    if start and end:
        if start == end:
            return start
        return f"{start} – {end}"
    return start or end


def strip_url_scheme(url: str | None) -> str:
    """basic-resume prefixes links with https://, so store bare host/path."""
    if not url:
        return ""
    text = str(url).strip()
    for prefix in ("https://", "http://"):
        if text.lower().startswith(prefix):
            return text[len(prefix):]
    return text


def split_date_range(date_range: dict[str, Any] | None) -> tuple[str, str]:
    """Split a profile date range into (start, end) display strings."""
    formatted = _format_date_range(date_range)
    if not formatted:
        return "", ""
    if formatted.startswith("Expected "):
        return "", formatted.removeprefix("Expected ")
    # _format_date_range joins with " – " (en dash with spaces).
    for sep in (" – ", " — ", " - "):
        if sep in formatted:
            start, end = formatted.split(sep, 1)
            return start.strip(), end.strip()
    return formatted.strip(), ""


def _format_issue_date(value: str) -> str:
    """Render a canonical profile date without claiming a timezone."""
    year, month, _day = value.split("-", 2)
    return _format_month(f"{year}-{month}")


def _project_heading(parent: dict[str, Any]) -> str:
    """Avoid repeating a project name when its title is identical."""
    if parent["name"] == parent["title"]:
        return parent["name"]
    return f"{parent['name']} — {parent['title']}"


def _experience_label(parent: dict[str, Any]) -> str:
    return f"{parent['role']} at {parent['organization']}"


def _join_names(names: list[str]) -> str:
    if len(names) <= 2:
        return " and ".join(names)
    return f"{', '.join(names[:-1])}, and {names[-1]}"


def _selected_skill_rows(
    plan: dict[str, Any], profile: dict[str, Any]
) -> list[dict[str, Any]]:
    """Return demonstrated skills in deterministic target-first order."""
    selected_achievements = _selected_achievement_map(plan, profile)
    selected_ids = {item["id"] for item in plan["selected_achievements"]}
    demonstrated_ids = {
        skill_id
        for achievement in selected_achievements.values()
        if achievement["id"] in selected_ids
        for skill_id in achievement["skills"]
    }
    matched_ids = {item["id"] for item in plan["matched_skills"]}
    frequency = Counter(
        skill_id
        for achievement in selected_achievements.values()
        if achievement["id"] in selected_ids
        for skill_id in achievement["skills"]
    )
    profile_skills = {
        skill["id"]: {**skill, "matched": skill["id"] in matched_ids}
        for skill in profile["skills"]
    }

    ordered_ids = sorted(
        demonstrated_ids,
        key=lambda skill_id: (
            not profile_skills[skill_id]["matched"],
            -frequency[skill_id],
            next(
                index
                for index, skill in enumerate(profile["skills"])
                if skill["id"] == skill_id
            ),
        ),
    )
    return [profile_skills[skill_id] for skill_id in ordered_ids]


def _default_summary(
    plan: dict[str, Any], profile: dict[str, Any]
) -> str:
    parents = {
        node["id"]: node
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    selected_by_kind: dict[str, list[dict[str, Any]]] = {}
    for reference in plan["selected_parents"]:
        selected_by_kind.setdefault(reference["kind"], []).append(
            parents[reference["id"]]
        )

    anchors = []
    experiences = selected_by_kind.get("experience", [])
    projects = selected_by_kind.get("project", [])
    if experiences:
        labels = _join_names(
            [_experience_label(node) for node in experiences]
        )
        anchors.append(f"hands-on experience as {labels}")
    if projects:
        project_names = _join_names([node["name"] for node in projects])
        anchors.append(f"project work across {project_names}")

    skills = [skill["name"] for skill in _selected_skill_rows(plan, profile)]
    featured_skills = ", ".join(skills[:8])
    anchor_clause = " and ".join(anchors)
    return (
        f"{plan['target_title']} with {anchor_clause}. "
        f"Core skills: {featured_skills}."
    )


def _bullet_text(
    plan: dict[str, Any],
    achievements: dict[str, dict[str, Any]],
    achievement_id: str,
) -> str:
    """Return a validated rewrite, or the unchanged reviewed source bullet."""
    record = plan.get("rewrites", {}).get(achievement_id)
    if record and record.get("used_rewrite"):
        return str(record["rewritten_text"])
    return achievements[achievement_id]["text"]


def _resume_sections(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    summary: str | None,
) -> dict[str, Any]:
    _validate_resume_inputs(plan, profile, summary=summary)
    achievements = _selected_achievement_map(plan, profile)
    parents = {
        node["id"]: node
        for section in ("experiences", "projects")
        for node in profile[section]
    }
    selected_parents = []
    for reference in plan.get("assembly", {}).get(
        "selected_parents", plan["selected_parents"]
    ):
        parent = parents[reference["id"]]
        selected_parents.append(
            {
                "kind": reference["kind"],
                "node": parent,
                "date_range": _format_date_range(parent.get("date_range")),
                "achievements": [
                    _bullet_text(plan, achievements, item)
                    for item in reference["achievement_ids"]
                ],
            }
        )

    return {
        "contact": profile["contact"],
        "target_title": plan["target_title"],
        "summary": summary or _default_summary(plan, profile),
        "skills": _selected_skill_rows(plan, profile),
        "selected_parents": selected_parents,
        "education": profile["education"],
        "certifications": profile["certifications"],
    }


def render_resume_markdown(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    summary: str | None = None,
) -> str:
    """Render a reviewable Markdown resume from a passing Phase 1 plan."""
    resume = _resume_sections(plan, profile, summary=summary)
    contact = resume["contact"]
    contact_bits = [contact["location"], contact["phone"], contact["email"]]
    contact_bits.extend(link["url"] for link in contact["links"])
    lines = [
        f"# {contact['name']}",
        "",
        f"## {resume['target_title']}",
        "",
        " | ".join(item for item in contact_bits if item),
        "",
        "## Professional Summary",
        "",
        resume["summary"],
        "",
        "## Skills",
        "",
    ]

    by_category: dict[str, list[str]] = {}
    for skill in resume["skills"]:
        by_category.setdefault(skill["category"], []).append(skill["name"])
    for category, names in by_category.items():
        lines.append(f"- **{category}:** {', '.join(names)}")

    for kind, section_heading in (
        ("experience", "Relevant Experience"),
        ("project", "Selected Projects"),
    ):
        matching_parents = [
            parent
            for parent in resume["selected_parents"]
            if parent["kind"] == kind
        ]
        if not matching_parents:
            continue
        lines.extend(["", f"## {section_heading}", ""])

        for parent in matching_parents:
            node = parent["node"]
            if parent["kind"] == "experience":
                title = f"{node['role']} — {node['organization']}"
                details = [item for item in (node.get("location"), parent["date_range"]) if item]
            else:
                title = _project_heading(node)
                details = [item for item in (node.get("url"), parent["date_range"]) if item]
            lines.extend([f"### {title}", ""])
            if details:
                lines.extend([f"*{' · '.join(details)}*", ""])
            lines.extend(f"- {text}" for text in parent["achievements"])
            lines.append("")

    lines.extend(["", "## Education", ""])
    for node in resume["education"]:
        details = [item for item in (node.get("location"), _format_date_range(node.get("date_range"))) if item]
        lines.append(f"### {node['credential']} — {node['institution']}")
        if details:
            lines.extend(["", f"*{' · '.join(details)}*"])
        if node.get("cgpa"):
            lines.extend(["", f"CGPA: {node['cgpa']}"])
        if node.get("coursework"):
            lines.extend(["", f"Relevant coursework: {', '.join(node['coursework'])}"])
        lines.append("")

    if resume["certifications"]:
        lines.extend(["## Certifications", ""])
        for node in resume["certifications"]:
            lines.append(
                f"- **{node['name']}** — {node['issuer']} ({_format_issue_date(node['issued_on'])})"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def render_resume_html(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    summary: str | None = None,
) -> str:
    """Render a self-contained, print-ready HTML resume."""
    resume = _resume_sections(plan, profile, summary=summary)
    contact = resume["contact"]
    contact_bits = " · ".join(
        item
        for item in (contact["location"], contact["phone"], contact["email"])
        if item
    )
    links = " · ".join(
        f'<a href="{_esc(link["url"])}">{_esc(link["label"])}</a>'
        for link in contact["links"]
    )
    skill_categories = []
    by_category: dict[str, list[str]] = {}
    for skill in resume["skills"]:
        by_category.setdefault(skill["category"], []).append(skill["name"])
    for category, names in by_category.items():
        skill_categories.append(
            "<div>"
            f'<span class="category">{_esc(category)}</span>'
            f"<span>{_esc(', '.join(names))}</span>"
            "</div>"
        )

    evidence_sections = []
    for kind, section_id, section_title in (
        ("experience", "experience", "Relevant Experience"),
        ("project", "projects", "Selected Projects"),
    ):
        matching_parents = [
            parent
            for parent in resume["selected_parents"]
            if parent["kind"] == kind
        ]
        if not matching_parents:
            continue

        articles = []
        for parent in matching_parents:
            node = parent["node"]
            if parent["kind"] == "experience":
                title = f"{node['role']} — {node['organization']}"
                details = " · ".join(
                    item
                    for item in (node.get("location"), parent["date_range"])
                    if item
                )
            else:
                title = _project_heading(node)
                details = " · ".join(
                    item
                    for item in (node.get("url"), parent["date_range"])
                    if item
                )
            bullets = "".join(
                f"<li>{_esc(text)}</li>" for text in parent["achievements"]
            )
            articles.append(
                "<article>"
                f"<h3>{_esc(title)}</h3>"
                + (f'<p class="meta">{_esc(details)}</p>' if details else "")
                + f"<ul>{bullets}</ul>"
                "</article>"
            )

        evidence_sections.append(
            f'<section aria-labelledby="{section_id}">'
            f'<h2 id="{section_id}">{section_title}</h2>'
            f"{''.join(articles)}"
            "</section>"
        )

    education = []
    for node in resume["education"]:
        details = " · ".join(
            item
            for item in (
                node.get("location"),
                _format_date_range(node.get("date_range")),
                f"CGPA: {node['cgpa']}" if node.get("cgpa") else None,
            )
            if item
        )
        coursework = (
            f'<p class="meta">Coursework: {_esc(", ".join(node["coursework"]))}</p>'
            if node.get("coursework")
            else ""
        )
        education.append(
            "<article>"
            f"<h3>{_esc(node['credential'])} — {_esc(node['institution'])}</h3>"
            + (f'<p class="meta">{_esc(details)}</p>' if details else "")
            + coursework
            + "</article>"
        )

    certifications = "".join(
        f"<li><strong>{_esc(node['name'])}</strong> — {_esc(node['issuer'])}"
        f" ({_esc(_format_issue_date(node['issued_on']))})</li>"
        for node in resume["certifications"]
    )
    certification_section = (
        '<section aria-labelledby="certifications">'
        '<h2 id="certifications">Certifications</h2>'
        f"<ul>{certifications}</ul></section>"
        if resume["certifications"]
        else ""
    )

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{_esc(contact['name'])} — {_esc(resume['target_title'])}</title>
  <style>
    :root {{ color-scheme: light; --ink: #111827; --muted: #4b5563; --rule: #d1d5db; }}
    * {{ box-sizing: border-box; }}
    body {{ margin: 0; color: var(--ink); font: 10.5pt/1.35 Arial, Helvetica, sans-serif; background: #f3f4f6; }}
    main {{ max-width: 8.5in; margin: 0 auto; background: white; padding: 0.55in 0.6in; }}
    h1, h2, h3 {{ margin: 0; font-family: Georgia, "Times New Roman", serif; }}
    h1 {{ font-size: 25pt; letter-spacing: -0.5px; }}
    h2 {{ border-bottom: 1px solid var(--rule); font-size: 11pt; margin: 12px 0 6px; padding-bottom: 2px; text-transform: uppercase; }}
    h3 {{ font-size: 10.8pt; margin-top: 8px; }}
    p {{ margin: 3px 0; }}
    .title {{ color: var(--muted); font-size: 13pt; margin-top: 2px; }}
    .contact {{ margin: 5px 0 0; }}
    .skills div {{ display: grid; grid-template-columns: 1.65in 1fr; gap: 5px; margin: 2px 0; align-items: start; }}
    .category {{ font-weight: 700; }}
    article {{ break-inside: avoid; margin-bottom: 6px; }}
    ul {{ margin: 3px 0 0; padding-left: 16px; }}
    li {{ margin: 1.5px 0; }}
    .meta {{ color: var(--muted); font-size: 9.3pt; }}
    a {{ color: var(--ink); text-decoration: none; }}
    @media print {{
      body {{ background: white; }}
      main {{ margin: 0; max-width: none; padding: 0.35in 0.5in; }}
      a {{ color: #000; }}
      @page {{ size: A4; margin: 0; }}
    }}
  </style>
</head>
<body>
<main data-plan-audit="{'pass' if all(plan['audit'].values()) else 'fail'}">
  <header>
    <h1>{_esc(contact['name'])}</h1>
    <p class="title">{_esc(resume['target_title'])}</p>
    <p class="meta contact">{_esc(contact_bits)}</p>
    <p class="meta contact">{links}</p>
  </header>
  <section aria-labelledby="summary">
    <h2 id="summary">Professional Summary</h2>
    <p class="summary">{_esc(resume['summary'])}</p>
  </section>
  <section aria-labelledby="skills">
    <h2 id="skills">Skills</h2>
    <div class="skills">{''.join(skill_categories)}</div>
  </section>
  {''.join(evidence_sections)}
  <section aria-labelledby="education"><h2 id="education">Education</h2>{''.join(education)}</section>
  {certification_section}
</main>
</body>
</html>
"""
