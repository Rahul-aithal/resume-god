"""Command-line interface for resume-god."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .tailor import build_tailoring_plan, load_profile, render_plan_markdown
from .render import render_resume_html, render_resume_markdown


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build audited resume artifacts")
    parser.add_argument("--profile", type=Path, default=Path("master_profile.yaml"))
    description = parser.add_mutually_exclusive_group(required=True)
    description.add_argument("--job-description", help="Job description text")
    description.add_argument(
        "--job-description-file",
        type=Path,
        help="Path to a UTF-8 job description (use - for stdin)",
    )
    parser.add_argument("--target-title", required=True)
    parser.add_argument("--max-achievements", type=int, default=10)
    parser.add_argument("--json-output", type=Path, help="Write the machine-readable plan")
    parser.add_argument("--output", type=Path, help="Write the Markdown plan")
    parser.add_argument(
        "--resume-output",
        type=Path,
        help="Write the final Markdown resume generated from the passing plan",
    )
    parser.add_argument(
        "--resume-html-output",
        type=Path,
        help="Write a self-contained, print-ready HTML resume",
    )
    parser.add_argument(
        "--summary",
        help="Optional user-reviewed summary to use instead of the deterministic default",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.job_description_file is not None:
        if str(args.job_description_file) == "-":
            job_description = sys.stdin.read()
        else:
            job_description = args.job_description_file.read_text(encoding="utf-8")
    else:
        job_description = args.job_description

    profile = load_profile(args.profile)
    plan = build_tailoring_plan(
        profile,
        job_description,
        target_title=args.target_title,
        max_achievements=args.max_achievements,
    )

    if args.json_output is not None:
        args.json_output.parent.mkdir(parents=True, exist_ok=True)
        args.json_output.write_text(
            json.dumps(plan, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

    markdown = render_plan_markdown(plan, profile)
    if args.output is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(markdown, encoding="utf-8")
    elif args.resume_output is None and args.resume_html_output is None:
        print(markdown, end="")

    if args.resume_output is not None or args.resume_html_output is not None:
        resume_markdown = render_resume_markdown(
            plan,
            profile,
            summary=args.summary,
        )
        if args.resume_output is not None:
            args.resume_output.parent.mkdir(parents=True, exist_ok=True)
            args.resume_output.write_text(resume_markdown, encoding="utf-8")
        if args.resume_html_output is not None:
            resume_html = render_resume_html(
                plan,
                profile,
                summary=args.summary,
            )
            args.resume_html_output.parent.mkdir(parents=True, exist_ok=True)
            args.resume_html_output.write_text(resume_html, encoding="utf-8")

    return 0 if all(plan["audit"].values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
