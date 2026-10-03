"""Command-line interface for resume-god."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .tailor import build_tailoring_plan, load_profile, render_plan_markdown
from .render import render_resume_html, render_resume_markdown
from .rewrite import rewrite_plan
from .typst import write_resume_pdf


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
    parser.add_argument(
        "--rewrite-provider",
        choices=("deterministic", "glm", "gemini"),
        default="deterministic",
        help="Constrained rewrite provider; deterministic means reviewed originals",
    )
    parser.add_argument(
        "--page-budget-chars",
        type=int,
        default=3200,
        help="Approximate one-page budget used before final PDF trimming",
    )
    return parser



def _build_tailor_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="resume-god tailor",
        description="Build a one-page Typst PDF and audited match report",
    )
    parser.add_argument("job_description_file", type=Path)
    parser.add_argument("--profile", type=Path, default=Path("master_profile.yaml"))
    parser.add_argument(
        "--target-title",
        help="Defaults to the role title parsed from the job description",
    )
    parser.add_argument("--max-achievements", type=int, default=10)
    parser.add_argument("--out", required=True, type=Path, help="Resume PDF path")
    parser.add_argument(
        "--report",
        type=Path,
        help="Markdown match report (default: <pdf-stem>-report.md)",
    )
    parser.add_argument(
        "--json-report",
        type=Path,
        help="Machine-readable report (default: <pdf-stem>-plan.json)",
    )
    parser.add_argument(
        "--source-output",
        type=Path,
        help="Keep the final generated Typst source file",
    )
    parser.add_argument(
        "--typst-bin",
        help="Typst executable (default: TYPST_BIN, .venv/bin/typst, then PATH)",
    )
    parser.add_argument("--summary", help="Optional user-reviewed summary")
    parser.add_argument(
        "--rewrite-provider",
        choices=("deterministic", "glm", "gemini"),
        default="deterministic",
    )
    parser.add_argument("--page-budget-chars", type=int, default=3200)
    return parser


def _tailor_main(argv: list[str]) -> int:
    parser = _build_tailor_parser()
    args = parser.parse_args(argv)
    job_description = args.job_description_file.read_text(encoding="utf-8")
    profile = load_profile(args.profile)

    target_title = args.target_title
    if target_title is None:
        from .jd_parser import parse_job_description

        target_title = parse_job_description(
            profile, job_description
        )["role_title"]

    plan = build_tailoring_plan(
        profile,
        job_description,
        target_title=target_title,
        max_achievements=args.max_achievements,
    )
    rewrite_provider = None
    if args.rewrite_provider != "deterministic":
        from .llm import make_provider

        rewrite_provider = make_provider(args.rewrite_provider)
    plan = rewrite_plan(
        plan,
        profile,
        provider=rewrite_provider,
        summary=args.summary,
        page_budget_chars=args.page_budget_chars,
    )
    adjusted, pdf = write_resume_pdf(
        plan,
        profile,
        args.out,
        summary=args.summary,
        typst_path=args.typst_bin,
        keep_source_path=args.source_output,
    )

    report_path = args.report or args.out.with_name(
        f"{args.out.stem}-report.md"
    )
    json_path = args.json_report or args.out.with_name(
        f"{args.out.stem}-plan.json"
    )
    report = render_plan_markdown(adjusted, profile)
    report += chr(10).join(
        [
            "## PDF output",
            "",
            f"- PDF: `{pdf['output']}`",
            f"- Renderer: **{pdf['renderer']} {pdf['renderer_version']}**",
            f"- Pages: **{pdf['page_count']}**",
            f"- Automatically trimmed bullets: **{len(pdf['trimmed_for_one_page'])}**",
            f"- PDF audit: **{'PASS' if pdf['audit_passed'] else 'FAIL'}**",
            "",
        ]
    )
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")
    json_path.parent.mkdir(parents=True, exist_ok=True)
    json_path.write_text(
        json.dumps(
            {**adjusted, "pdf": pdf},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    print(pdf["output"])
    print(report_path.resolve())
    print(json_path.resolve())
    return 0 if pdf["audit_passed"] else 1

def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments and arguments[0] == "tailor":
        return _tailor_main(arguments[1:])

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
    rewrite_provider = None
    if args.rewrite_provider != "deterministic":
        from .llm import make_provider

        rewrite_provider = make_provider(args.rewrite_provider)
    plan = rewrite_plan(
        plan,
        profile,
        provider=rewrite_provider,
        summary=args.summary,
        page_budget_chars=args.page_budget_chars,
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
