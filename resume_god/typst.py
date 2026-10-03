"""One-page ATS-friendly Typst PDF rendering with automatic trimming."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any

from pypdf import PdfReader

from .render import _format_date_range, _resume_sections
from .assembly import apply_assembly, build_assembly


TYPST_VERSION = "0.15.1"
BASIC_RESUME_VERSION = "0.2.9"
BASIC_RESUME_IMPORT = f"@preview/basic-resume:{BASIC_RESUME_VERSION}"


def typst_binary(explicit_path: str | Path | None = None) -> Path:
    """Resolve a local Typst binary without silently choosing another renderer."""
    candidates: list[Path]
    if explicit_path is not None:
        candidates = [Path(explicit_path)]
    elif os.environ.get("TYPST_BIN"):
        candidates = [Path(os.environ["TYPST_BIN"])]
    else:
        root = Path(__file__).resolve().parents[1]
        candidates = [root / ".venv" / "bin" / "typst", Path("typst")]
    for candidate in candidates:
        if candidate.is_absolute() and candidate.is_file():
            return candidate
        resolved = shutil.which(str(candidate))
        if resolved:
            return Path(resolved)
    raise RuntimeError(
        "Typst was not found. Run scripts/install-typst.sh or set TYPST_BIN."
    )


def _typst_string(value: Any) -> str:
    """Escape untrusted text for a Typst double-quoted string argument."""
    text = str(value).replace("\\", "\\\\").replace('"', '\\"')
    return f'"{text}"'


def _typst_dates(start: str, end: str) -> str:
    """Render a dates argument without a trailing dash for single dates."""
    if start and end:
        if start == end:
            return _typst_string(start)
        return (
            f"dates-helper(start-date: {_typst_string(start)}, "
            f"end-date: {_typst_string(end)})"
        )
    single = start or end
    return _typst_string(single)


def _typst_paragraph(value: Any) -> str:
    """Escape body text for a top-level Typst paragraph (no [...] wrapper)."""
    return _typst_content(value)[1:-1]


def _strip_url_scheme(url: str | None) -> str:
    """basic-resume prefixes links with https://, so store bare host/path."""
    if not url:
        return ""
    text = str(url).strip()
    for prefix in ("https://", "http://"):
        if text.lower().startswith(prefix):
            return text[len(prefix):]
    return text


def _split_date_range(date_range: dict[str, Any] | None) -> tuple[str, str]:
    """Split a profile date range into (start, end) for dates-helper()."""
    if not date_range:
        return "", ""
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


def _link_bare_host(url: str) -> tuple[str, str]:
    """Return (bare_host, label) for a contact link."""
    bare = _strip_url_scheme(url)
    return bare, bare


def _typst_content(value: Any) -> str:
    """Escape untrusted text for a Typst content block."""
    text = str(value)
    replacements = {
        "\\": "\\\\",
        "#": "\\#",
        "[": "\\[",
        "]": "\\]",
        "*": "\\*",
        "_": "\\_",
        "`": "\\`",
        "$": "\\$",
        "<": "\\<",
        ">": "\\>",
        "@": "\\@",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return f"[{text}]"


def render_resume_typst(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    summary: str | None = None,
) -> str:
    """Render a resume with the official preview/basic-resume template.

    Uses ``#import "@preview/basic-resume:0.2.9": *`` and
    ``#show: resume.with(...)`` strictly — no hand-rolled page/section
    helpers. All content still comes from ``_resume_sections()`` so the
    reviewed-profile grounding guarantees are unchanged.
    """
    resume = _resume_sections(plan, profile, summary=summary)
    contact = resume["contact"]

    links_by_label = {
        str(link.get("label", "")).lower(): str(link.get("url", ""))
        for link in contact.get("links", [])
    }
    github = _strip_url_scheme(
        links_by_label.get("github")
        or next(
            (
                link.get("url", "")
                for link in contact.get("links", [])
                if "github" in str(link.get("label", "")).lower()
                or "github" in str(link.get("url", "")).lower()
            ),
            "",
        )
    )
    linkedin = _strip_url_scheme(
        links_by_label.get("linkedin")
        or next(
            (
                link.get("url", "")
                for link in contact.get("links", [])
                if "linkedin" in str(link.get("label", "")).lower()
                or "linkedin" in str(link.get("url", "")).lower()
            ),
            "",
        )
    )
    personal_site = _strip_url_scheme(
        links_by_label.get("portfolio")
        or links_by_label.get("website")
        or links_by_label.get("personal-site")
        or links_by_label.get("personal site")
        or ""
    )

    target_title_block = _typst_paragraph(resume["target_title"])
    summary_block = _typst_paragraph(resume["summary"])
    lines = [
        f"// Generated by resume-god with {BASIC_RESUME_IMPORT} (Typst {TYPST_VERSION})",
        f'#import "{BASIC_RESUME_IMPORT}": *',
        "",
        "#show: resume.with(",
        f"  author: {_typst_string(contact.get('name', ''))},",
        f"  location: {_typst_string(contact.get('location', '') or '')},",
        f"  email: {_typst_string(contact.get('email', '') or '')},",
        f"  github: {_typst_string(github)},",
        f"  linkedin: {_typst_string(linkedin)},",
        f"  phone: {_typst_string(contact.get('phone', '') or '')},",
        f"  personal-site: {_typst_string(personal_site)},",
        '  accent-color: "#26428b",',
        '  font: "New Computer Modern",',
        '  paper: "a4",',
        "  author-position: center,",
        "  personal-info-position: center,",
        ")",
        "",
        f"#align(center)[*{target_title_block}*]",
        "",
        "== Professional Summary",
        "",
        summary_block,
        "",
        "== Technical Skills",
        "",
    ]

    categories: dict[str, list[str]] = {}
    for skill in resume["skills"]:
        categories.setdefault(skill["category"], []).append(skill["name"])
    for category, names in categories.items():
        lines.append(
            f"- *{category}:* " + _typst_content(", ".join(names))[1:-1]
        )
    lines.append("")

    section_order = plan.get("assembly", {}).get(
        "section_order", ["experience", "project"]
    )
    headings = {
        "experience": "Work Experience",
        "project": "Projects",
    }
    for kind in section_order:
        matching = [item for item in resume["selected_parents"] if item["kind"] == kind]
        if not matching:
            continue
        lines.append(f"== {headings[kind]}")
        lines.append("")
        for parent in matching:
            node = parent["node"]
            start, end = _split_date_range(node.get("date_range"))
            if parent["kind"] == "experience":
                lines.append(
                    "#work("
                    f"title: {_typst_string(node.get('role', ''))}, "
                    f"company: {_typst_string(node.get('organization', ''))}, "
                    f"location: {_typst_string(node.get('location', '') or '')}, "
                    f"dates: {_typst_dates(start, end)},"
                    ")"
                )
            else:
                title = str(node.get("title", "") or "")
                name = str(node.get("name", "") or "")
                role = "" if name == title or not title else title
                url = _strip_url_scheme(node.get("url"))
                lines.append(
                    "#project("
                    f"name: {_typst_string(name)}, "
                    f"role: {_typst_string(role)}, "
                    f"url: {_typst_string(url)}, "
                    f"dates: {_typst_dates(start, end)},"
                    ")"
                )
            for bullet in parent["achievements"]:
                lines.append(f"- {_typst_content(bullet)[1:-1]}")
            lines.append("")

    lines.append("== Education")
    lines.append("")
    for node in resume["education"]:
        start, end = _split_date_range(node.get("date_range"))
        lines.append(
            "#edu("
            f"institution: {_typst_string(node.get('institution', ''))}, "
            f"location: {_typst_string(node.get('location', '') or '')}, "
            f"dates: {_typst_dates(start, end)}, "
            f"degree: {_typst_string(node.get('credential', ''))},"
            ")"
        )
        details: list[str] = []
        if node.get("cgpa"):
            details.append(f"- CGPA: {node['cgpa']}")
        if node.get("coursework"):
            details.append(
                f"- Relevant Coursework: {', '.join(node['coursework'])}"
            )
        for detail in details:
            # Escape content after the "- " marker.
            lines.append("- " + _typst_content(detail[2:])[1:-1])
        lines.append("")

    if resume["certifications"]:
        lines.append("== Certifications")
        lines.append("")
        for node in resume["certifications"]:
            issued = str(node.get("issued_on", "") or "")
            date_label = ""
            if issued:
                try:
                    year, month, _day = issued.split("-", 2)
                    date_label = _format_date_range(
                        {"precision": "month", "start": f"{year}-{month}"}
                    ) or issued
                except ValueError:
                    date_label = issued
            lines.append(
                "#certificates("
                f"name: {_typst_string(node.get('name', ''))}, "
                f"issuer: {_typst_string(node.get('issuer', ''))}, "
                f"date: {_typst_string(date_label)},"
                ")"
            )
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


def _pdf_page_count(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def _update_coverage_after_trim(
    plan: dict[str, Any], profile: dict[str, Any]
) -> None:
    from .graph import ProfileGraph

    graph = ProfileGraph(profile)
    selected_ids = {item["id"] for item in plan["selected_achievements"]}
    selected_skills = {
        skill_id
        for achievement in plan["selected_achievements"]
        for skill_id in achievement["skills"]
    }
    inferred_selected: set[str] = set()
    for achievement in plan["selected_achievements"]:
        inferred_selected.update(
            graph.inferred_evidence_for(set(achievement["skills"]))
        )
    available = {
        skill_id
        for achievement in profile["achievements"]
        for skill_id in achievement["skills"]
    }
    inferred_available: set[str] = set()
    for achievement in profile["achievements"]:
        inferred_available.update(
            graph.inferred_evidence_for(set(achievement["skills"]))
        )
    profile_skill_ids = {item["id"] for item in profile["skills"]}
    for row in plan.get("requirement_coverage", []):
        if row["kind"] != "profile_skill":
            continue
        if row["id"] in selected_skills:
            row["status"] = "covered"
            row["evidence_available"] = True
        elif row["id"] in inferred_selected:
            row["status"] = "inferred_covered"
            row["evidence_available"] = True
        elif row["id"] in available:
            row["status"] = "profile_skill_not_selected"
            row["evidence_available"] = True
        elif row["id"] in inferred_available:
            row["status"] = "inferred_available_not_selected"
            row["evidence_available"] = True
        else:
            row["status"] = "profile_skill_without_evidence"
            row["evidence_available"] = False
    plan["gap_report"]["matched_but_unevidenced_skills"] = [
        {
            "id": row["id"],
            "name": row["name"],
            "priority": row["priority"],
            "status": row["status"],
        }
        for row in plan.get("requirement_coverage", [])
        if row["kind"] == "profile_skill"
        and row["status"] not in ("covered", "inferred_covered")
        and row["id"] in profile_skill_ids
    ]
    plan["gap_report"]["inferred_covered_skills"] = [
        {
            "id": row["id"],
            "name": row["name"],
            "priority": row["priority"],
            "status": row["status"],
        }
        for row in plan.get("requirement_coverage", [])
        if row["status"] == "inferred_covered"
    ]
    plan["gap_report"]["all_known_requirements_covered"] = not plan["gap_report"][
        "matched_but_unevidenced_skills"
    ]


def _without_lowest_ranked(
    plan: dict[str, Any], profile: dict[str, Any], *, summary: str | None
) -> dict[str, Any]:
    ranking = list(plan.get("ranking", []))
    if len(ranking) <= 1:
        raise ValueError("Resume still exceeds one page after retaining the top bullet")
    ranking.pop()
    base = deepcopy(plan)
    base["ranking"] = ranking
    achievements = {item["id"]: item for item in profile["achievements"]}
    retained_ids = {row["achievement_id"] for row in ranking}
    base["selected_achievements"] = [
        achievements[item] for item in retained_ids
    ]
    base.pop("assembly", None)
    assembly = build_assembly(
        base,
        profile,
        page_budget_chars=10_000_000,
        summary=summary,
    )
    result = apply_assembly(base, profile, assembly)
    result["rewrites"] = {
        achievement_id: record
        for achievement_id, record in plan.get("rewrites", {}).items()
        if achievement_id in retained_ids
    }
    used = sum(record["used_rewrite"] for record in result["rewrites"].values())
    result["rewrite_summary"] = {
        "selected_achievement_count": len(result["rewrites"]),
        "used_rewrite_count": used,
        "fallback_count": len(result["rewrites"]) - used,
    }
    _update_coverage_after_trim(result, profile)
    return result


def write_resume_pdf(
    plan: dict[str, Any],
    profile: dict[str, Any],
    output_path: str | Path,
    *,
    summary: str | None = None,
    typst_path: str | Path | None = None,
    keep_source_path: str | Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compile repeatedly, removing the lowest-ranked bullet if pages spill."""
    binary = typst_binary(typst_path)
    version = subprocess.run(
        [str(binary), "--version"], check=True, capture_output=True, text=True
    ).stdout.strip().removeprefix("typst ")
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    current = deepcopy(plan)
    trimmed: list[str] = []
    with tempfile.TemporaryDirectory(prefix="resume-god-typst-") as directory:
        temporary = Path(directory)
        source_path = temporary / "resume.typ"
        pdf_path = temporary / "resume.pdf"
        attempts: list[dict[str, Any]] = []

        while True:
            source = render_resume_typst(current, profile, summary=summary)
            source_path.write_text(source, encoding="utf-8")
            compiled = subprocess.run(
                [str(binary), "compile", str(source_path), str(pdf_path)],
                capture_output=True,
                text=True,
            )
            if compiled.returncode != 0:
                raise RuntimeError(
                    "Typst compilation failed:\n" + compiled.stdout + compiled.stderr
                )
            pages = _pdf_page_count(pdf_path)
            attempts.append(
                {
                    "achievement_count": len(current["selected_achievements"]),
                    "page_count": pages,
                }
            )
            if pages == 1:
                if keep_source_path is not None:
                    keep = Path(keep_source_path)
                    keep.parent.mkdir(parents=True, exist_ok=True)
                    keep.write_text(source, encoding="utf-8")
                output.write_bytes(pdf_path.read_bytes())
                result = {
                    "output": str(output),
                    "renderer": "typst",
                    "renderer_version": f"Typst {version}",
                    "page_count": pages,
                    "attempts": attempts,
                    "trimmed_for_one_page": trimmed,
                    "audit_passed": all(current["audit"].values())
                    and all(current.get("rewrite_audit", {}).values()),
                }
                return current, result
            if len(current["selected_achievements"]) <= 1:
                raise RuntimeError(
                    "Even the highest-ranked bullet cannot fit on one page"
                )
            removed = current["ranking"][-1]["achievement_id"]
            trimmed.append(removed)
            current = _without_lowest_ranked(
                current, profile, summary=summary
            )
