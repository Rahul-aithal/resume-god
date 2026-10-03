"""Build deterministic application packets from a manifest.

Phase 3 keeps multi-role resume generation auditable. Each manifest entry is
turned into the same Phase 1 plan and Phase 2 resume artifacts, while an index
reports target skills that matched but still lack selected evidence.
"""

from __future__ import annotations

import argparse
import json
import re
import tempfile
from pathlib import Path
from typing import Any

import yaml

from .paths import default_manifest_path, default_profile_path
from .render import render_resume_html, render_resume_markdown
from .rewrite import rewrite_plan
from .tailor import (
    build_tailoring_plan,
    load_profile,
    render_plan_markdown,
)
from .typst import write_resume_pdf


APPLICATION_MANIFEST_VERSION = 1
_APPLICATION_ID = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])$")
_APPLICATION_KEYS = {
    "id",
    "company",
    "target_title",
    "job_description_file",
    "max_achievements",
    "summary",
}
_DEFAULT_KEYS = {"max_achievements"}


def _unpadded_text(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip() or value != value.strip():
        raise ValueError(f"{field} must be non-empty and unpadded")
    return value


def _max_achievements(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(f"{field} must be an integer of at least 1")
    return value


def _validate_manifest(
    manifest: Any, manifest_path: Path
) -> list[dict[str, Any]]:
    """Validate a manifest and resolve JD paths beside the manifest."""
    if not isinstance(manifest, dict):
        raise ValueError("Application manifest must be a mapping")
    unknown_manifest_keys = set(manifest) - {"version", "defaults", "applications"}
    if unknown_manifest_keys:
        raise ValueError(
            "Unknown application manifest keys: "
            + ", ".join(sorted(unknown_manifest_keys))
        )
    manifest_version = manifest.get("version")
    if (
        isinstance(manifest_version, bool)
        or manifest_version != APPLICATION_MANIFEST_VERSION
    ):
        raise ValueError("Application manifest version must be 1")

    raw_applications = manifest.get("applications")
    if not isinstance(raw_applications, list) or not raw_applications:
        raise ValueError("Application manifest must contain at least one application")

    defaults = manifest.get("defaults", {})
    if not isinstance(defaults, dict):
        raise ValueError("Application manifest defaults must be a mapping")
    unknown_default_keys = set(defaults) - _DEFAULT_KEYS
    if unknown_default_keys:
        raise ValueError(
            "Unknown application default keys: "
            + ", ".join(sorted(unknown_default_keys))
        )
    default_max = _max_achievements(
        defaults.get("max_achievements", 10), "defaults.max_achievements"
    )

    applications: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for position, raw in enumerate(raw_applications, start=1):
        prefix = f"applications[{position}]"
        if not isinstance(raw, dict):
            raise ValueError(f"{prefix} must be a mapping")
        unknown_keys = set(raw) - _APPLICATION_KEYS
        if unknown_keys:
            raise ValueError(
                f"Unknown {prefix} keys: " + ", ".join(sorted(unknown_keys))
            )

        application_id = _unpadded_text(raw.get("id"), f"{prefix}.id")
        if not _APPLICATION_ID.fullmatch(application_id):
            raise ValueError(
                f"{prefix}.id must use lowercase letters, digits, and hyphens"
            )
        if application_id in seen_ids:
            raise ValueError(f"Duplicate application id: {application_id}")
        seen_ids.add(application_id)

        required_fields = ("company", "target_title", "job_description_file")
        values = {
            field: _unpadded_text(raw.get(field), f"{prefix}.{field}")
            for field in required_fields
        }
        job_description_file = Path(values["job_description_file"])
        if not job_description_file.is_absolute():
            job_description_file = manifest_path.parent / job_description_file

        application: dict[str, Any] = {
            "id": application_id,
            "company": values["company"],
            "target_title": values["target_title"],
            "job_description_file": job_description_file,
            "max_achievements": _max_achievements(
                raw.get("max_achievements", default_max),
                f"{prefix}.max_achievements",
            ),
        }
        if "summary" in raw:
            application["summary"] = _unpadded_text(
                raw["summary"], f"{prefix}.summary"
            )
        applications.append(application)

    return applications


def load_application_manifest(path: str | Path) -> list[dict[str, Any]]:
    """Load and validate an application manifest."""
    manifest_path = Path(path)
    with manifest_path.open(encoding="utf-8") as handle:
        manifest = yaml.safe_load(handle)
    return _validate_manifest(manifest, manifest_path)


def _packet_record(
    application: dict[str, Any], plan: dict[str, Any]
) -> dict[str, Any]:
    matched_ids = [skill["id"] for skill in plan["matched_skills"]]
    evidenced_ids = {
        skill_id
        for row in plan["ranking"]
        for skill_id in row["direct_skill_matches"]
    }
    evidenced_ids.update(
        skill_id
        for row in plan["ranking"]
        for skill_id in row.get("expanded_skill_matches", [])
    )
    evidenced_ids.update(
        skill_id
        for row in plan["ranking"]
        for skill_id in row.get("inferred_skill_matches", [])
    )
    matched_by_id = {
        skill["id"]: skill for skill in plan["matched_skills"]
    }
    unevidenced = [matched_by_id[item] for item in matched_ids if item not in evidenced_ids]
    return {
        "id": application["id"],
        "company": application["company"],
        "target_title": application["target_title"],
        "selected_achievement_count": len(plan["selected_achievements"]),
        "matched_skill_count": len(matched_ids),
        "evidenced_skill_count": len(matched_ids) - len(unevidenced),
        "matched_but_unevidenced_skills": [
            {"id": skill["id"], "name": skill["name"]} for skill in unevidenced
        ],
        "audit_passed": all(plan["audit"].values())
        and all(plan.get("rewrite_audit", {}).values()),
    }


def _markdown_text(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("[", "\\[")
        .replace("]", "\\]")
        .replace("|", "\\|")
    )


def _render_index_markdown(index: dict[str, Any]) -> str:
    overall = "PASS" if index["all_audits_passed"] else "FAIL"
    lines = [
        "# Application packet index",
        "",
        f"Generated packets: **{len(index['applications'])}**",
        "",
        f"Overall selection audit: **{overall}**",
        "",
        "Direct-skill coverage counts only target skills that matched the reviewed",
        "profile **and** have selected achievement evidence. Skills listed as gaps",
        "must not be added to a resume without a new user-reviewed profile fact.",
        "",
        "| Application | Evidence | Direct-skill coverage | Audit |",
        "|---|---:|---:|---|",
    ]
    for record in index["applications"]:
        lines.append(
            "| "
            f"[{_markdown_text(record['id'])}]({record['id']}/resume.html) — "
            + (
                f"[PDF]({record['resume_pdf']}) · "
                if record.get("resume_pdf")
                else ""
            )
            + f"{_markdown_text(record['company'])} / "
            f"{_markdown_text(record['target_title'])} "
            f"| {record['selected_achievement_count']} achievements "
            f"| {record['evidenced_skill_count']}/{record['matched_skill_count']} "
            f"| {'PASS' if record['audit_passed'] else 'FAIL'} |"
        )

    lines.extend(["", "## Matched but unevidenced skills", ""])
    rows_with_gaps = [
        record
        for record in index["applications"]
        if record["matched_but_unevidenced_skills"]
    ]
    if not rows_with_gaps:
        lines.append("- None")
    else:
        for record in rows_with_gaps:
            names = ", ".join(
                skill["name"]
                for skill in record["matched_but_unevidenced_skills"]
            )
            lines.append(f"- **{record['id']}:** {names}")

    lines.append("")
    return "\n".join(lines)


def build_application_packets(
    profile: dict[str, Any],
    manifest: Any,
    *,
    manifest_path: str | Path,
    output_dir: str | Path,
    include_pdfs: bool = False,
    typst_path: str | Path | None = None,
    page_budget_chars: int = 3200,
) -> dict[str, Any]:
    """Build every packet in memory/temporary files, then write one batch."""
    applications = _validate_manifest(manifest, Path(manifest_path))
    output_root = Path(output_dir)
    records: list[dict[str, Any]] = []
    artifacts: dict[Path, str] = {}
    binary_artifacts: dict[Path, bytes] = {}

    with tempfile.TemporaryDirectory(prefix="resume-god-packets-") as staging:
        staging_root = Path(staging)
        for application in applications:
            job_description = application["job_description_file"].read_text(
                encoding="utf-8"
            )
            base_plan = build_tailoring_plan(
                profile,
                job_description,
                target_title=application["target_title"],
                max_achievements=application["max_achievements"],
            )
            summary = application.get("summary")
            assembled = rewrite_plan(
                base_plan,
                profile,
                summary=summary,
                page_budget_chars=page_budget_chars,
            )
            report_plan = assembled
            machine_plan: dict[str, Any] = assembled
            pdf_result: dict[str, Any] | None = None

            if include_pdfs:
                staged_pdf = staging_root / f"{application['id']}.pdf"
                report_plan, pdf_result = write_resume_pdf(
                    assembled,
                    profile,
                    staged_pdf,
                    summary=summary,
                    typst_path=typst_path,
                )
                final_pdf = output_root / application["id"] / "resume.pdf"
                pdf_result["output"] = str(final_pdf)
                binary_artifacts[final_pdf] = staged_pdf.read_bytes()
                machine_plan = {**report_plan, "pdf": pdf_result}

            packet_dir = output_root / application["id"]
            markdown_report = render_plan_markdown(report_plan, profile)
            if pdf_result is not None:
                markdown_report += chr(10).join(
                    [
                        "## PDF output",
                        "",
                        f"- PDF: `{pdf_result['output']}`",
                        f"- Pages: **{pdf_result['page_count']}**",
                        f"- Automatically trimmed bullets: **{len(pdf_result['trimmed_for_one_page'])}**",
                        "",
                    ]
                )
            artifacts[packet_dir / "tailoring-plan.md"] = markdown_report
            artifacts[packet_dir / "tailoring-plan.json"] = (
                json.dumps(machine_plan, ensure_ascii=False, indent=2) + "\n"
            )
            artifacts[packet_dir / "resume.md"] = render_resume_markdown(
                report_plan, profile, summary=summary
            )
            artifacts[packet_dir / "resume.html"] = render_resume_html(
                report_plan, profile, summary=summary
            )
            record = _packet_record(application, report_plan)
            if pdf_result is not None:
                record["pdf_page_count"] = pdf_result["page_count"]
                record["pdf_trimmed_count"] = len(
                    pdf_result["trimmed_for_one_page"]
                )
                record["resume_pdf"] = f"{application['id']}/resume.pdf"
            records.append(record)

        index: dict[str, Any] = {
            "version": APPLICATION_MANIFEST_VERSION,
            "phase": "application_packets",
            "application_count": len(records),
            "include_pdfs": include_pdfs,
            "all_audits_passed": all(record["audit_passed"] for record in records),
            "applications": records,
        }
        artifacts[output_root / "index.json"] = (
            json.dumps(index, ensure_ascii=False, indent=2) + "\n"
        )
        artifacts[output_root / "index.md"] = _render_index_markdown(index)

        # Generate every text and PDF artifact before changing the output
        # directory. A malformed later application cannot leave a partial batch.
        for path, content in artifacts.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        for path, content in binary_artifacts.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(content)

    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build audited application packets from a manifest"
    )
    parser.add_argument("--profile", type=Path, default=None)
    parser.add_argument("--manifest", type=Path, default=None, help="Defaults to RESUME_GOD_MANIFEST or the checkout manifest")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument(
        "--pdf",
        action="store_true",
        help="Also generate a one-page Typst PDF for each application",
    )
    parser.add_argument(
        "--typst-bin",
        help="Typst executable (default: TYPST_BIN, .venv/bin/typst, then PATH)",
    )
    parser.add_argument("--page-budget-chars", type=int, default=3200)
    args = parser.parse_args(argv)

    profile_path = args.profile or default_profile_path()
    manifest_path = args.manifest or default_manifest_path()
    profile = load_profile(profile_path)
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8"))
    index = build_application_packets(
        profile,
        manifest,
        manifest_path=manifest_path,
        output_dir=args.output_dir,
        include_pdfs=args.pdf,
        typst_path=args.typst_bin,
        page_budget_chars=args.page_budget_chars,
    )
    print((args.output_dir / "index.md").resolve())
    return 0 if index["all_audits_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
