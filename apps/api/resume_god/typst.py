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


def _pdf_page_count(path: Path) -> int:
    return len(PdfReader(str(path)).pages)


def _update_coverage_after_trim(
    plan: dict[str, Any], profile: dict[str, Any]
) -> None:
    from .tailor import refresh_coverage

    refresh_coverage(plan, profile)


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


TEMPLATE_PATH = Path(__file__).resolve().parent / "template" / "resume.typ"
TEMPLATE_DATA_FILENAME = "resume-data.json"


def _drop_bullet_from_data(data: dict[str, Any], achievement_id: str) -> bool:
    """Remove one bullet (and its id); drop sections left with no bullets."""
    for section in list(data.get("sections", [])):
        ids = section.get("achievement_ids", [])
        if achievement_id in ids:
            index = ids.index(achievement_id)
            del ids[index]
            bullets = section.get("bullets", [])
            if index < len(bullets):
                del bullets[index]
            if not section.get("bullets"):
                data["sections"].remove(section)
            return True
    return False


def _data_bullet_count(data: dict[str, Any]) -> int:
    return sum(len(section.get("bullets", [])) for section in data.get("sections", []))


def write_resume_data_pdf(
    plan: dict[str, Any],
    profile: dict[str, Any],
    output_path: str | Path,
    *,
    data: dict[str, Any],
    summary: str | None = None,
    typst_path: str | Path | None = None,
    keep_source_path: str | Path | None = None,
    keep_data_path: str | Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Compile the static template against resume-data.json (file import).

    ``data`` is the validated resume-data dict and is authoritative for PDF
    content. On page spill the lowest-ranked bullet is dropped from both the
    data and the plan (via the shared trim helper) and recompiled.
    """
    import json as _json

    binary = typst_binary(typst_path)
    version = subprocess.run(
        [str(binary), "--version"], check=True, capture_output=True, text=True
    ).stdout.strip().removeprefix("typst ")
    try:
        template_source = TEMPLATE_PATH.read_text(encoding="utf-8")
    except FileNotFoundError as error:
        raise RuntimeError(f"Typst template not found: {TEMPLATE_PATH}") from error
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)

    current_plan = deepcopy(plan)
    current_data = deepcopy(data)
    trimmed: list[str] = []
    with tempfile.TemporaryDirectory(prefix="resume-god-typst-") as directory:
        temporary = Path(directory)
        source_path = temporary / "resume.typ"
        data_path = temporary / TEMPLATE_DATA_FILENAME
        pdf_path = temporary / "resume.pdf"
        source_path.write_text(template_source, encoding="utf-8")
        attempts: list[dict[str, Any]] = []

        while True:
            data_path.write_text(
                _json.dumps(current_data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
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
                    "achievement_count": _data_bullet_count(current_data),
                    "page_count": pages,
                }
            )
            if pages == 1:
                if keep_source_path is not None:
                    keep = Path(keep_source_path)
                    keep.parent.mkdir(parents=True, exist_ok=True)
                    keep.write_text(template_source, encoding="utf-8")
                if keep_data_path is not None:
                    keep_data = Path(keep_data_path)
                    keep_data.parent.mkdir(parents=True, exist_ok=True)
                    keep_data.write_text(
                        _json.dumps(current_data, ensure_ascii=False, indent=2) + "\n",
                        encoding="utf-8",
                    )
                output.write_bytes(pdf_path.read_bytes())
                result = {
                    "output": str(output),
                    "renderer": "typst",
                    "renderer_version": f"Typst {version}",
                    "resume_data_version": current_data.get("version"),
                    "font_requested": current_data.get("font", "Calibri"),
                    "page_count": pages,
                    "attempts": attempts,
                    "trimmed_for_one_page": trimmed,
                    "audit_passed": all(current_plan["audit"].values())
                    and all(current_plan.get("rewrite_audit", {}).values()),
                }
                return current_plan, result
            if _data_bullet_count(current_data) <= 1:
                raise RuntimeError(
                    "Even the highest-ranked bullet cannot fit on one page"
                )
            removed = current_plan["ranking"][-1]["achievement_id"]
            if not _drop_bullet_from_data(current_data, removed):
                raise RuntimeError(
                    "Resume data no longer matches the plan ranking; "
                    "cannot trim for one page"
                )
            trimmed.append(removed)
            current_plan = _without_lowest_ranked(
                current_plan, profile, summary=summary
            )
