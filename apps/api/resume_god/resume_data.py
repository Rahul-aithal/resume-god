"""Resume-data JSON: the LLM-authored intermediate that Typst renders.

Pipeline: JD -> graph evidence pack -> LLM selects + writes resume-data JSON
(schema v1 below) -> grounding validation -> resume-data.json -> static Typst
template (file import, no string interpolation) -> one-page PDF.

The deterministic path synthesizes the identical schema from the existing
assembly so offline runs stay byte-equivalent in structure.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol


RESUME_DATA_VERSION = 1

DEFAULT_FONT = "Calibri"
# Fallback chain appended by the static Typst template when the requested
# font is not installed (Calibri is proprietary and missing on most Linux
# boxes). Liberation Sans is metrically close to Arial and visually close to
# Calibri, so the one-page layout survives the fallback.
FONT_FALLBACKS = ("Carlito", "Liberation Sans", "DejaVu Sans")


class ResumeDataProvider(Protocol):
    def complete_json(self, prompt: str) -> dict[str, Any]:
        ...


def build_evidence_pack(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    candidate_pool: int = 20,
) -> dict[str, Any]:
    """Serialize graph-ranked evidence for the LLM selection step."""
    achievements = {item["id"]: item for item in profile["achievements"]}
    ranking = list(plan.get("ranking", []))[:candidate_pool]
    candidates = []
    for row in ranking:
        achievement = achievements.get(row["achievement_id"])
        if achievement is None:
            continue
        candidates.append(
            {
                "achievement_id": achievement["id"],
                "source_text": achievement["text"],
                "skills": list(achievement.get("skills", [])),
                "score": row.get("score"),
            }
        )
    parsed = plan.get("job_description_parse", {})
    return {
        "target_title": plan.get("target_title", ""),
        "candidate_bullets": candidates,
        "matched_skills": [
            {"id": item["id"], "name": item.get("name", "")}
            for item in plan.get("matched_skills", [])
        ],
        "parsed_requirements": parsed,
    }


def _select_prompt(pack: dict[str, Any], max_select: int) -> str:
    return f"""Select the strongest resume bullets for this target role.

Rules:
- Reply with JSON exactly as {{"selected":["achievement_id", ...]}}.
- Use ONLY achievement_id values from candidate_bullets, at most {max_select}.
- Order strongest first. Prefer direct skill coverage of the target role,
  then quantified impact, then recency.
- Never invent ids, skills, or text. Selection only — no rewriting here.

Target title: {pack['target_title']}
Matched skills: {[item['name'] for item in pack['matched_skills']]}
Bullets: {pack['candidate_bullets']}"""


def select_resume_bullets(
    plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    provider: ResumeDataProvider | None,
    max_select: int,
    candidate_pool: int = 20,
) -> dict[str, Any]:
    """Let the LLM choose (and order) bullets; validate + refill deterministically.

    Returns {"selected_ids": [...], "provider": ..., "provider_requested": ...,
    "fallback_error": ...|None, "refilled_ids": [...], "dropped_ids": [...]}.
    Unknown or duplicate ids are dropped; shortfalls are refilled from the
    deterministic ranking so the count contract always holds.
    """
    from .llm import LLMError  # local import: llm must not depend on this module

    pack = build_evidence_pack(plan, profile, candidate_pool=candidate_pool)
    pool_ids = [item["achievement_id"] for item in pack["candidate_bullets"]]
    pool_set = set(pool_ids)

    requested = getattr(provider, "name", "deterministic")
    raw_selected: list[str] = []
    fallback_error: str | None = None
    if provider is not None:
        try:
            response = provider.complete_json(_select_prompt(pack, max_select))
            candidate = response.get("selected", [])
            if isinstance(candidate, list):
                raw_selected = [str(item) for item in candidate][:max_select]
            else:
                fallback_error = "LLM selection was not a JSON list"
        except Exception as error:  # network/auth/shape failure -> deterministic
            fallback_error = str(error) if not isinstance(error, LLMError) else str(error)

    selected: list[str] = []
    dropped: list[str] = []
    for achievement_id in raw_selected:
        if achievement_id in pool_set and achievement_id not in selected:
            selected.append(achievement_id)
        elif achievement_id not in selected:
            dropped.append(achievement_id)

    refilled: list[str] = []
    if len(selected) < max_select:
        for row in plan.get("ranking", []):
            achievement_id = row["achievement_id"]
            if achievement_id not in selected and achievement_id in pool_set:
                selected.append(achievement_id)
                refilled.append(achievement_id)
            if len(selected) >= max_select:
                break

    return {
        "selected_ids": selected,
        "provider": provider.name if provider is not None and not fallback_error else "deterministic",
        "provider_requested": requested if provider is not None else "deterministic",
        "fallback_error": fallback_error,
        "refilled_ids": refilled,
        "dropped_ids": dropped,
    }


def narrow_plan_ranking(
    plan: dict[str, Any], selected_ids: list[str]
) -> dict[str, Any]:
    """Return a plan copy whose ranking keeps only selected ids, in LLM order."""
    narrowed = deepcopy(plan)
    position = {achievement_id: index for index, achievement_id in enumerate(selected_ids)}
    rows = [
        row for row in narrowed.get("ranking", []) if row["achievement_id"] in position
    ]
    rows.sort(key=lambda row: position[row["achievement_id"]])
    narrowed["ranking"] = rows
    return narrowed


def build_resume_data(
    rewritten_plan: dict[str, Any],
    profile: dict[str, Any],
    *,
    font: str | None,
    summary: str | None = None,
) -> dict[str, Any]:
    """Transform assembled sections into the Typst-consumed schema v1."""
    from .render import (
        _format_date_range,
        _resume_sections,
        split_date_range,
        strip_url_scheme,
    )

    resume = _resume_sections(rewritten_plan, profile, summary=summary)
    contact = resume["contact"]
    links = {
        str(link.get("label", "")).lower(): str(link.get("url", ""))
        for link in contact.get("links", [])
    }

    def pick(*labels: str) -> str:
        for label in labels:
            if links.get(label):
                return strip_url_scheme(links[label])
        return ""

    sections = []
    for parent in resume["selected_parents"]:
        node = parent["node"]
        start, end = split_date_range(node.get("date_range"))
        entry: dict[str, Any] = {
            "kind": parent["kind"],
            "dates": {"start": start, "end": end},
            "bullets": list(parent["achievements"]),
        }
        if parent["kind"] == "experience":
            entry.update(
                {
                    "role": str(node.get("role", "")),
                    "organization": str(node.get("organization", "")),
                    "location": str(node.get("location", "") or ""),
                }
            )
        else:
            title = str(node.get("title", "") or "")
            name = str(node.get("name", "") or "")
            entry.update(
                {
                    "name": name,
                    "role": "" if name == title or not title else title,
                    "url": strip_url_scheme(node.get("url")),
                }
            )
        # Achievement ids ride alongside texts so trimming stays auditable.
        reference = next(
            (
                ref
                for ref in rewritten_plan.get("assembly", {}).get(
                    "selected_parents", rewritten_plan.get("selected_parents", [])
                )
                if ref.get("id") == node.get("id")
            ),
            {},
        )
        entry["achievement_ids"] = list(reference.get("achievement_ids", []))
        sections.append(entry)

    education = []
    for node in resume["education"]:
        start, end = split_date_range(node.get("date_range"))
        details = []
        if node.get("cgpa"):
            details.append(f"CGPA: {node['cgpa']}")
        if node.get("coursework"):
            details.append(f"Relevant Coursework: {', '.join(node['coursework'])}")
        education.append(
            {
                "institution": str(node.get("institution", "")),
                "location": str(node.get("location", "") or ""),
                "dates": {"start": start, "end": end},
                "degree": str(node.get("credential", "")),
                "details": details,
            }
        )

    certifications = []
    for node in resume["certifications"]:
        issued = str(node.get("issued_on", "") or "")
        date_label = issued
        if issued:
            try:
                year, month, _day = issued.split("-", 2)
                date_label = _format_date_range(
                    {"precision": "month", "start": f"{year}-{month}"}
                ) or issued
            except ValueError:
                date_label = issued
        certifications.append(
            {
                "name": str(node.get("name", "")),
                "issuer": str(node.get("issuer", "")),
                "date": date_label,
            }
        )

    categories: dict[str, list[str]] = {}
    for skill in resume["skills"]:
        categories.setdefault(skill["category"], []).append(skill["name"])

    return {
        "version": RESUME_DATA_VERSION,
        "target_title": resume["target_title"],
        "summary": resume["summary"],
        "font": (font or DEFAULT_FONT).strip() or DEFAULT_FONT,
        "contact": {
            "name": str(contact.get("name", "")),
            "location": str(contact.get("location", "") or ""),
            "email": str(contact.get("email", "") or ""),
            "phone": str(contact.get("phone", "") or ""),
            "github": pick("github"),
            "linkedin": pick("linkedin"),
            "personal_site": pick("portfolio", "website", "personal-site", "personal site"),
        },
        "skills": [
            {"category": category, "names": names}
            for category, names in categories.items()
        ],
        "sections": sections,
        "education": education,
        "certifications": certifications,
    }


def validate_resume_data(
    data: dict[str, Any],
    profile: dict[str, Any],
) -> dict[str, Any]:
    """Grounding gate for LLM-authored resume data.

    Drops bullets with unknown achievement ids, falls back texts that fail
    the rewrite validator to their reviewed source, and reports everything.
    Returns {"data": cleaned, "dropped_bullets": [...],
    "fallback_bullets": [...], "issues": [...]}.
    """
    from .rewrite import validate_rewrite

    achievements = {item["id"]: item for item in profile["achievements"]}
    cleaned = deepcopy(data)
    dropped: list[str] = []
    fallback: list[str] = []
    issues: list[str] = []

    if cleaned.get("version") != RESUME_DATA_VERSION:
        issues.append(
            f"unsupported resume-data version: {cleaned.get('version')}"
        )
    if not isinstance(cleaned.get("font"), str) or not cleaned.get("font", "").strip():
        issues.append("font must be a non-empty string")

    for section in cleaned.get("sections", []):
        ids = section.get("achievement_ids", [])
        texts = section.get("bullets", [])
        kept_ids: list[str] = []
        kept_texts: list[str] = []
        for index, achievement_id in enumerate(ids):
            text = texts[index] if index < len(texts) else ""
            achievement = achievements.get(achievement_id)
            if achievement is None:
                dropped.append(str(achievement_id))
                issues.append(f"dropped unknown achievement id: {achievement_id}")
                continue
            passed, reasons = validate_rewrite(
                achievement["text"], text, achievement, profile
            )
            if passed:
                kept_ids.append(achievement_id)
                kept_texts.append(text)
            else:
                kept_ids.append(achievement_id)
                kept_texts.append(achievement["text"])
                fallback.append(str(achievement_id))
                issues.append(
                    f"bullet fell back to reviewed original {achievement_id}: "
                    + "; ".join(reasons)
                )
        section["achievement_ids"] = kept_ids
        section["bullets"] = kept_texts

    return {
        "data": cleaned,
        "dropped_bullets": dropped,
        "fallback_bullets": fallback,
        "issues": issues,
    }
