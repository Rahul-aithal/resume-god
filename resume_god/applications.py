"""Build deterministic application packets from a manifest.

Phase 3 keeps multi-role resume generation auditable. Each manifest entry is
turned into the same Phase 1 plan and Phase 2 resume artifacts, while an index
reports target skills that matched but still lack selected evidence.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

import yaml

from .render import render_resume_html, render_resume_markdown
from .tailor import (
    build_tailoring_plan,
    load_profile,
    render_plan_markdown,
)


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
        "audit_passed": all(plan["audit"].values()),
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
            f"{_markdown_text(record['company'])} / "
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
) -> dict[str, Any]:
    """Build all plan and resume artifacts, then write them as one batch."""
    applications = _validate_manifest(manifest, Path(manifest_path))
    output_root = Path(output_dir)
    records: list[dict[str, Any]] = []
    artifacts: dict[Path, str] = {}

    for application in applications:
        job_description = application["job_description_file"].read_text(
            encoding="utf-8"
        )
        plan = build_tailoring_plan(
            profile,
            job_description,
            target_title=application["target_title"],
            max_achievements=application["max_achievements"],
        )
        summary = application.get("summary")
        packet_dir = output_root / application["id"]
        artifacts[packet_dir / "tailoring-plan.md"] = render_plan_markdown(
            plan, profile
        )
        artifacts[packet_dir / "tailoring-plan.json"] = (
            json.dumps(plan, ensure_ascii=False, indent=2) + "\n"
        )
        artifacts[packet_dir / "resume.md"] = render_resume_markdown(
            plan, profile, summary=summary
        )
        artifacts[packet_dir / "resume.html"] = render_resume_html(
            plan, profile, summary=summary
        )
        records.append(_packet_record(application, plan))

    index: dict[str, Any] = {
        "version": APPLICATION_MANIFEST_VERSION,
        "phase": "application_packets",
        "application_count": len(records),
        "all_audits_passed": all(record["audit_passed"] for record in records),
        "applications": records,
    }
    artifacts[output_root / "index.json"] = (
        json.dumps(index, ensure_ascii=False, indent=2) + "\n"
    )
    artifacts[output_root / "index.md"] = _render_index_markdown(index)

    # Prepare every artifact before changing the output directory. A malformed
    # later application therefore cannot leave a partial packet batch behind.
    for path, content in artifacts.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    return index


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build audited application packets from a manifest"
    )
    parser.add_argument("--profile", type=Path, default=Path("master_profile.yaml"))
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args(argv)

    profile = load_profile(args.profile)
    manifest = yaml.safe_load(args.manifest.read_text(encoding="utf-8"))
    index = build_application_packets(
        profile,
        manifest,
        manifest_path=args.manifest,
        output_dir=args.output_dir,
    )
    print((args.output_dir / "index.md").resolve())
    return 0 if index["all_audits_passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
