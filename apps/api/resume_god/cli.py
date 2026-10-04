"""Command-line interface for resume-god."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from . import __version__
from .paths import default_db_path, default_profile_path
from .tailor import build_tailoring_plan, load_profile, render_plan_markdown
from .render import render_resume_html, render_resume_markdown
from .rewrite import rewrite_plan
from .typst import write_resume_data_pdf
from .diff import build_skill_diff, render_skill_diff_markdown


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Build audited resume artifacts")
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )
    parser.add_argument("--profile", type=Path, default=None, help="Defaults to RESUME_GOD_PROFILE or the reviewed checkout profile")
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
        "--parser-provider",
        choices=("auto", "deterministic", "glm", "gemini"),
        default="auto",
        help="JD parsing provider; auto uses an LLM when a key exists, else offline",
    )
    parser.add_argument(
        "--rewrite-provider",
        choices=("auto", "deterministic", "glm", "gemini"),
        default="auto",
        help="Constrained rewrite provider; auto uses an LLM when a key exists",
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
    parser.add_argument(
        "--version", action="version", version=f"%(prog)s {__version__}"
    )
    parser.add_argument("job_description_file", type=Path)
    parser.add_argument("--profile", type=Path, default=None, help="Defaults to RESUME_GOD_PROFILE or the reviewed checkout profile")
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
        "--font",
        default=None,
        help="Resume typeface (default: Calibri with automatic fallback)",
    )
    parser.add_argument(
        "--parser-provider",
        choices=("auto", "deterministic", "glm", "gemini"),
        default="auto",
        help="JD parsing provider (default: auto with offline fallback)",
    )
    parser.add_argument(
        "--rewrite-provider",
        choices=("auto", "deterministic", "glm", "gemini"),
        default="auto",
        help="Constrained rewrite provider (default: auto with offline fallback)",
    )
    parser.add_argument(
        "--select-provider",
        choices=("auto", "deterministic", "glm", "gemini"),
        default="auto",
        help="Bullet selection provider: the LLM picks from graph-ranked evidence (default: auto with offline fallback)",
    )
    parser.add_argument(
        "--data-output",
        type=Path,
        help="Keep the validated resume-data.json fed to Typst",
    )
    parser.add_argument("--page-budget-chars", type=int, default=3200)
    return parser


def _load_env() -> None:
    """Load .env files if python-dotenv is available (keys for LLM providers)."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(Path.cwd() / ".env", override=False)
    try:
        from .paths import PROJECT_ROOT
    except ImportError:
        return
    load_dotenv(PROJECT_ROOT / ".env", override=False)


def _doctor_main() -> int:
    _load_env()
    from .typst import typst_binary

    profile_path = default_profile_path()
    profile_ok = profile_path.is_file()
    try:
        typst_path = typst_binary()
        typst_ok = True
        typst_detail = str(typst_path)
    except RuntimeError as error:
        typst_ok = False
        typst_detail = str(error)

    print(f"resume-god {__version__}")
    print(f"Profile: {profile_path} [{'PASS' if profile_ok else 'FAIL'}]")
    print(f"Typst:   {typst_detail} [{'PASS' if typst_ok else 'FAIL'}]")
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401

        print("Web deps (fastapi/uvicorn): PASS")
        web_ok = True
    except ModuleNotFoundError as error:
        print(f"Web deps (fastapi/uvicorn): FAIL ({error})")
        print("Fix: re-run ./scripts/install-cli.sh to rebuild the global tool env.")
        web_ok = False
    print(
        "GLM key: "
        + ("configured" if any(os.environ.get(k) for k in ('GLM_API_KEY','ZAI_API_KEY','Z_AI_API_KEY','ZHIPU_API_KEY')) else "not configured")
    )
    print(
        "Gemini key: "
        + ("configured" if any(os.environ.get(k) for k in ('GEMINI_API_KEY','GOOGLE_API_KEY')) else "not configured")
    )
    from .llm import active_provider_label

    print(f"LLM default (auto): {active_provider_label('auto')}")
    print(f"Gemini model: {os.environ.get('GEMINI_MODEL', 'gemini-3-flash-preview')} (override with GEMINI_MODEL)")
    print(f"GLM model: {os.environ.get('GLM_MODEL', 'glm-4.6')} (override with GLM_MODEL)")
    if not (profile_ok and typst_ok and web_ok):
        return 1
    return 0


def _tailor_main(argv: list[str]) -> int:
    parser = _build_tailor_parser()
    args = parser.parse_args(argv)
    job_description = args.job_description_file.read_text(encoding="utf-8")
    profile_path = args.profile or default_profile_path()
    profile = load_profile(profile_path)

    from .jd_parser import parse_job_description

    from .llm import resolve_or_none

    parser_provider, parser_req, parser_req_error = resolve_or_none(
        args.parser_provider
    )
    parsed = parse_job_description(
        profile,
        job_description,
        provider=parser_provider,
        target_title=args.target_title,
    )
    # Stamp what was requested (auto/deterministic/explicit) since the
    # offline branch of the parser cannot know the CLI choice.
    parsed["provider_requested"] = parser_req
    if parser_req_error and not parsed.get("provider_fallback_error"):
        parsed["provider_fallback_error"] = parser_req_error
    target_title = args.target_title or parsed["role_title"]

    plan = build_tailoring_plan(
        profile,
        job_description,
        target_title=target_title,
        max_achievements=args.max_achievements,
        parsed_job_description=parsed,
    )
    rewrite_provider, rewrite_req, rewrite_req_error = resolve_or_none(
        args.rewrite_provider
    )
    select_provider, select_req, select_req_error = resolve_or_none(
        args.select_provider
    )
    from .resume_data import (
        build_resume_data,
        narrow_plan_ranking,
        select_resume_bullets,
        validate_resume_data,
    )

    # Stage 3 of the pipeline: the LLM selects from graph-ranked evidence.
    selection = select_resume_bullets(
        plan,
        profile,
        provider=select_provider,
        max_select=args.max_achievements,
    )
    plan = narrow_plan_ranking(plan, selection["selected_ids"])
    plan["llm_selection"] = {
        **selection,
        "requested": select_req,
        "fallback_error": select_req_error or selection["fallback_error"],
    }
    plan = rewrite_plan(
        plan,
        profile,
        provider=rewrite_provider,
        summary=args.summary,
        page_budget_chars=args.page_budget_chars,
    )
    plan["rewrite_provider_requested"] = rewrite_req
    if rewrite_req_error and not plan.get("rewrite_provider_fallback_error"):
        plan["rewrite_provider_fallback_error"] = rewrite_req_error
    # Stage 4: deterministic transform to the Typst-consumed schema, then the
    # grounding gate over the LLM-authored data.
    resume_data = build_resume_data(
        plan, profile, font=args.font, summary=args.summary
    )
    validation = validate_resume_data(resume_data, profile)
    resume_data = validation["data"]
    plan["resume_data_validation"] = {
        "dropped_bullets": validation["dropped_bullets"],
        "fallback_bullets": validation["fallback_bullets"],
        "issues": validation["issues"],
    }
    adjusted, pdf = write_resume_data_pdf(
        plan,
        profile,
        args.out,
        data=resume_data,
        summary=args.summary,
        typst_path=args.typst_bin,
        keep_source_path=args.source_output,
        keep_data_path=args.data_output,
    )

    report_path = args.report or args.out.with_name(
        f"{args.out.stem}-report.md"
    )
    json_path = args.json_report or args.out.with_name(
        f"{args.out.stem}-plan.json"
    )
    report = render_plan_markdown(adjusted, profile)
    diff = build_skill_diff(adjusted, profile)
    report += render_skill_diff_markdown(diff)
    parsed_meta = adjusted.get("job_description_parse", {})
    parser_used = parsed_meta.get("provider", "deterministic")
    parser_req = parsed_meta.get("provider_requested", parser_used)
    rewrite_used = adjusted.get("rewrite_provider", "deterministic")
    rewrite_req = adjusted.get("rewrite_provider_requested", rewrite_used)
    selection_meta = adjusted.get("llm_selection", {})
    select_used = selection_meta.get("provider", "deterministic")
    select_req = selection_meta.get("requested", select_used)
    validation_meta = adjusted.get("resume_data_validation", {})
    report += chr(10).join(
        [
            "## Providers",
            "",
            f"- JD parsing: requested **{parser_req}**, used **{parser_used}**"
            + (
                f" (fallback: {parsed_meta.get('provider_fallback_error')})"
                if parsed_meta.get("provider_fallback_error")
                else ""
            ),
            f"- Selection: requested **{select_req}**, used **{select_used}**"
            + (
                f" (fallback: {selection_meta.get('fallback_error')})"
                if selection_meta.get("fallback_error")
                else ""
            )
            + (
                f" — dropped {selection_meta.get('dropped_ids', [])}, "
                f"refilled {selection_meta.get('refilled_ids', [])}"
                if selection_meta
                else ""
            ),
            f"- Rewriting: requested **{rewrite_req}**, used **{rewrite_used}**"
            + (
                f" (fallback: {adjusted.get('rewrite_provider_fallback_error')})"
                if adjusted.get("rewrite_provider_fallback_error")
                else ""
            ),
            f"- Resume-data validation: dropped **{validation_meta.get('dropped_bullets', [])}**, "
            f"fallbacks **{validation_meta.get('fallback_bullets', [])}**",
            "",
        ]
    )
    report += chr(10).join(
        [
            "## PDF output",
            "",
            f"- PDF: `{pdf['output']}`",
            f"- Renderer: **{pdf['renderer']} {pdf['renderer_version']}**",
            f"- Font: **{pdf.get('font_requested', 'Calibri')}**",
            f"- Resume-data schema: **v{pdf.get('resume_data_version', '?')}** (Typst file import)",
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
            {**adjusted, "skill_diff": diff, "pdf": pdf},
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


def _build_render_pdf_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="resume-god render-pdf",
        description=(
            "Render the final PDF from a reviewed plan JSON. "
            "Step 1 (AI generates JSON): resume-god tailor ... --json-report plan.json. "
            "Step 2 (you review): edit rewritten_text/summary in plan.json. "
            "Step 3 (this command): re-validates every edit against "
            "master_profile.yaml and compiles the Typst PDF."
        ),
    )
    parser.add_argument(
        "--plan", required=True, type=Path, help="Reviewed plan JSON from tailor"
    )
    parser.add_argument("--profile", type=Path, default=None, help="Defaults to RESUME_GOD_PROFILE or the reviewed checkout profile")
    parser.add_argument("--out", required=True, type=Path, help="Resume PDF path")
    parser.add_argument(
        "--source-output",
        type=Path,
        help="Keep the final generated Typst source file",
    )
    parser.add_argument(
        "--typst-bin",
        help="Typst executable (default: TYPST_BIN, .venv/bin/typst, then PATH)",
    )
    parser.add_argument("--summary", help="Optional user-reviewed summary override")
    parser.add_argument(
        "--font",
        default=None,
        help="Resume typeface (default: Calibri with automatic fallback)",
    )
    parser.add_argument(
        "--data-output",
        type=Path,
        help="Keep the validated resume-data.json fed to Typst",
    )
    parser.add_argument(
        "--report-json",
        type=Path,
        help="Write machine-readable {plan, validation, pdf} report",
    )
    return parser


def _render_pdf_main(argv: list[str]) -> int:
    parser = _build_render_pdf_parser()
    args = parser.parse_args(argv)
    profile_path = args.profile or default_profile_path()
    profile = load_profile(profile_path)
    plan = json.loads(args.plan.read_text(encoding="utf-8"))

    from .rewrite import revalidate_plan_rewrites
    from .resume_data import build_resume_data, validate_resume_data

    try:
        rejected = revalidate_plan_rewrites(plan, profile)
    except ValueError as error:
        print(f"Refusing to render: {error}", file=sys.stderr)
        return 1
    for achievement_id in rejected:
        print(
            f"Review edit for {achievement_id} introduced new claims; "
            "fell back to the reviewed original.",
            file=sys.stderr,
        )

    resume_data = build_resume_data(
        plan, profile, font=args.font, summary=args.summary
    )
    validation = validate_resume_data(resume_data, profile)
    resume_data = validation["data"]
    if validation["issues"]:
        print(
            "Resume-data validation: "
            + "; ".join(validation["issues"]),
            file=sys.stderr,
        )

    adjusted, pdf = write_resume_data_pdf(
        plan,
        profile,
        args.out,
        data=resume_data,
        summary=args.summary,
        typst_path=args.typst_bin,
        keep_source_path=args.source_output,
        keep_data_path=args.data_output,
    )

    print(pdf["output"])
    print(f"Pages: {pdf['page_count']}")
    print(f"Font: {pdf.get('font_requested', 'Calibri')}")
    print(f"Resume-data schema: v{pdf.get('resume_data_version', '?')}")
    if args.report_json is not None:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        args.report_json.write_text(
            json.dumps(
                {
                    "plan": adjusted,
                    "rejected_review_edits": rejected,
                    "resume_data_validation": validation,
                    "pdf": pdf,
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        print(args.report_json.resolve())
    if rejected:
        print(f"Rejected review edits (used original): {', '.join(rejected)}")
    if pdf["trimmed_for_one_page"]:
        print(
            "Trimmed for one page: " + ", ".join(pdf["trimmed_for_one_page"])
        )
    return 0 if pdf["audit_passed"] else 1


def _company_main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="resume-god company")
    sub = parser.add_subparsers(dest="action", required=True)
    add = sub.add_parser("add", help="Add or update a company")
    add.add_argument("name")
    add.add_argument("--db", type=Path, default=None)
    add.add_argument("--website", default="")
    add.add_argument("--location", default="")
    add.add_argument("--about", default="")
    add.add_argument("--notes", default="")
    show = sub.add_parser("show", help="Show a company with role counts")
    show.add_argument("name")
    show.add_argument("--db", type=Path, default=None)
    list_p = sub.add_parser("list", help="List companies with role counts")
    list_p.add_argument("--db", type=Path, default=None)
    args = parser.parse_args(argv)
    from .store import company_detail, connect, list_companies, upsert_company

    conn = connect(args.db or default_db_path())
    if args.action == "add":
        company = upsert_company(
            conn, args.name, website=args.website, location=args.location,
            about=args.about, notes=args.notes,
        )
        print(json.dumps(company, ensure_ascii=False, indent=2))
    elif args.action == "show":
        detail = company_detail(conn, args.name)
        if not detail:
            print(f"Unknown company: {args.name}", file=sys.stderr)
            return 1
        print(f"{detail['name']} — {detail['role_count']} role(s)")
        for status, count in detail["by_status"].items():
            print(f"  {status}: {count}")
        for role in detail["roles"]:
            print(f"  - [{role['id']}] {role['target_title']} ({role['status']})")
    else:
        for company in list_companies(conn):
            print(f"{company['name']} — {company['role_count']} role(s)")
    return 0


def _role_main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="resume-god role")
    sub = parser.add_subparsers(dest="action", required=True)
    add = sub.add_parser("add", help="Record a role application for a company")
    add.add_argument("--company", required=True)
    add.add_argument("--title", required=True)
    add.add_argument("--db", type=Path, default=None)
    add.add_argument("--status", default="applied")
    add.add_argument("--jd-file", type=Path, default=None)
    add.add_argument("--job-url", default="")
    add.add_argument("--salary", default="")
    add.add_argument("--location", default="")
    add.add_argument("--notes", default="")
    lst = sub.add_parser("list", help="List roles, optionally per company")
    lst.add_argument("--company", default=None)
    lst.add_argument("--db", type=Path, default=None)
    set_status = sub.add_parser("status", help="Update a role status")
    set_status.add_argument("role_id", type=int)
    set_status.add_argument("status")
    set_status.add_argument("--db", type=Path, default=None)
    args = parser.parse_args(argv)
    from .store import add_role, connect, list_roles, set_role_status

    conn = connect(args.db or default_db_path())
    if args.action == "add":
        jd_text = args.jd_file.read_text(encoding="utf-8") if args.jd_file else ""
        role = add_role(
            conn, args.company, args.title, status=args.status,
            job_url=args.job_url, salary=args.salary, location=args.location,
            jd_text=jd_text, notes=args.notes,
        )
        print(json.dumps(role, ensure_ascii=False, indent=2))
    elif args.action == "list":
        for role in list_roles(conn, company_name=args.company):
            print(f"[{role['id']}] {role['company_name']} / {role['target_title']} ({role['status']})")
    else:
        role = set_role_status(conn, args.role_id, args.status)
        print(json.dumps(role, ensure_ascii=False, indent=2))
    return 0


def _web_main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(prog="resume-god web")
    parser.add_argument("--db", type=Path, default=None)
    parser.add_argument("--profile", type=Path, default=None)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--outputs", type=Path, default=Path("outputs/web"))
    args = parser.parse_args(argv)
    try:
        import uvicorn
    except ModuleNotFoundError:
        print(
            "Web dependencies are missing (uvicorn/fastapi). "
            "Re-run ./scripts/install-cli.sh to rebuild the global tool env, "
            "or use `uv run resume-god web` from the repo checkout.",
            file=sys.stderr,
        )
        return 1

    from .web import create_app

    app = create_app(
        db_path=args.db or default_db_path(),
        profile_path=args.profile or default_profile_path(),
        outputs_dir=args.outputs,
    )
    uvicorn.run(app, host=args.host, port=args.port)
    return 0


def main(argv: list[str] | None = None) -> int:
    _load_env()
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments and arguments[0] == "tailor":
        return _tailor_main(arguments[1:])
    if arguments and arguments[0] == "render-pdf":
        return _render_pdf_main(arguments[1:])
    if arguments and arguments[0] == "doctor":
        return _doctor_main()
    if arguments and arguments[0] == "company":
        return _company_main(arguments[1:])
    if arguments and arguments[0] == "role":
        return _role_main(arguments[1:])
    if arguments and arguments[0] == "web":
        return _web_main(arguments[1:])
    if arguments and arguments[0] == "applications":
        from .applications import main as applications_main

        return applications_main(arguments[1:])
    if arguments and arguments[0] == "graph":
        from .graph import main as graph_main

        return graph_main(arguments[1:])
    if arguments and arguments[0] == "parse-jd":
        from .jd_parser import main as parse_jd_main

        return parse_jd_main(arguments[1:])

    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.job_description_file is not None:
        if str(args.job_description_file) == "-":
            job_description = sys.stdin.read()
        else:
            job_description = args.job_description_file.read_text(encoding="utf-8")
    else:
        job_description = args.job_description

    profile_path = args.profile or default_profile_path()
    profile = load_profile(profile_path)
    from .jd_parser import parse_job_description
    from .llm import resolve_or_none

    parser_provider, parser_req, parser_req_error = resolve_or_none(
        args.parser_provider
    )
    parsed = parse_job_description(
        profile,
        job_description,
        provider=parser_provider,
        target_title=args.target_title,
    )
    parsed["provider_requested"] = parser_req
    if parser_req_error and not parsed.get("provider_fallback_error"):
        parsed["provider_fallback_error"] = parser_req_error
    plan = build_tailoring_plan(
        profile,
        job_description,
        target_title=args.target_title,
        max_achievements=args.max_achievements,
        parsed_job_description=parsed,
    )
    rewrite_provider, rewrite_req, rewrite_req_error = resolve_or_none(
        args.rewrite_provider
    )
    plan = rewrite_plan(
        plan,
        profile,
        provider=rewrite_provider,
        summary=args.summary,
        page_budget_chars=args.page_budget_chars,
    )
    plan["rewrite_provider_requested"] = rewrite_req
    if rewrite_req_error and not plan.get("rewrite_provider_fallback_error"):
        plan["rewrite_provider_fallback_error"] = rewrite_req_error

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
