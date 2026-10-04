"""Full local frontend for resume-god (FastAPI + plain HTML, no npm)."""

from __future__ import annotations

import html
import hashlib
import json
import re
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from .diff import build_skill_diff
from .rewrite import rewrite_plan
from .tailor import build_tailoring_plan, load_profile, render_plan_markdown
from .store import (
    add_role,
    company_detail,
    connect,
    get_company,
    list_companies,
    list_roles,
    upsert_company,
)
from .typst import write_resume_data_pdf

CSS = """
body{font-family:system-ui,Arial,sans-serif;max-width:1000px;margin:0 auto;padding:24px;color:#111}
header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
nav a{margin-right:12px}
table{border-collapse:collapse;width:100%;margin:12px 0}
th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:14px}
th{background:#f3f4f6}
.card{border:1px solid #ddd;border-radius:8px;padding:16px;margin:12px 0}
textarea{width:100%;min-height:220px;font-family:monospace}
input,select{padding:8px;margin:4px 0;width:100%;box-sizing:border-box}
button{padding:10px 16px;background:#26428b;color:#fff;border:none;border-radius:6px;cursor:pointer}
.badge{display:inline-block;padding:2px 8px;border-radius:12px;background:#eef;font-size:12px}
"""


def _esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _slug(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:60] or "role"


def _layout(title: str, body: str) -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_esc(title)} — resume-god</title><style>{CSS}</style></head>
<body><header><h1>resume-god</h1><nav>
<a href="/">Dashboard</a><a href="/companies">Companies</a>
<a href="/roles">Roles</a><a href="/new">+ New application</a>
</nav></header><h2>{_esc(title)}</h2>{body}</body></html>"""


def create_app(
    *,
    db_path: str | Path,
    profile_path: str | Path,
    outputs_dir: str | Path,
) -> FastAPI:
    db_path = Path(db_path)
    outputs_dir = Path(outputs_dir)
    app = FastAPI(title="resume-god")
    outputs_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/files", StaticFiles(directory=str(outputs_dir)), name="files")

    from .api import jobs as api_jobs

    api_jobs.PROFILE_PATH = Path(profile_path)
    app.include_router(api_jobs.router)

    @contextmanager
    def db_session() -> Iterator[Any]:
        conn = connect(db_path)
        try:
            yield conn
        finally:
            conn.close()

    @app.get("/", response_class=HTMLResponse)
    def dashboard() -> str:
        with db_session() as conn:
            companies = list_companies(conn)
            roles = list_roles(conn)
            rows = "".join(
                f"<tr><td><a href='/companies/{_esc(c['name'])}'>{_esc(c['name'])}</a></td>"
                f"<td>{c['role_count']}</td></tr>"
                for c in companies
            ) or "<tr><td colspan=2>No companies yet — add one below.</td></tr>"
            role_rows = "".join(
                f"<tr><td>{_esc(r['company_name'])}</td><td>{_esc(r['target_title'])}</td>"
                f"<td><span class=badge>{_esc(r['status'])}</span></td></tr>"
                for r in roles[:20]
            )
            return _layout("Dashboard", f"""
<div class=card><h3>Companies ({len(companies)}) — roles applied: {len(roles)}</h3>
<table><tr><th>Company</th><th>Roles applied</th></tr>{rows}</table></div>
<div class=card><h3>Recent roles</h3>
<table><tr><th>Company</th><th>Role</th><th>Status</th></tr>{role_rows or '<tr><td colspan=3>None</td></tr>'}</table></div>
<div class=card><h3>Add company</h3>
<form method=post action="/companies/add">
<input name=name placeholder="Company name (e.g. Goodspace)" required>
<input name=website placeholder="Website">
<input name=location placeholder="Location">
<textarea name=about placeholder="All data about the company…" style="min-height:80px"></textarea>
<button>Add / update company</button></form></div>""")

    @app.get("/companies", response_class=HTMLResponse)
    def companies_page() -> str:
        with db_session() as conn:
            companies = list_companies(conn)
            cards = "".join(
                f"<div class=card><a href='/companies/{_esc(c['name'])}'><b>{_esc(c['name'])}</b></a>"
                f" — {c['role_count']} role(s)</div>"
                for c in companies
            ) or "<p>No companies yet.</p>"
            return _layout("Companies", cards)

    @app.post("/companies/add")
    async def company_add(request: Request):
        form = await request.form()
        with db_session() as conn:
            upsert_company(
                conn, str(form.get("name", "")),
                website=str(form.get("website", "")),
                location=str(form.get("location", "")),
                about=str(form.get("about", "")),
            )
        return RedirectResponse("/", status_code=303)

    @app.get("/companies/{name}", response_class=HTMLResponse)
    def company_page(name: str) -> str:
        with db_session() as conn:
            detail = company_detail(conn, name)
        if not detail:
            return _layout("Not found", f"<p>Unknown company {_esc(name)}</p>")
        if not detail:
            return _layout("Not found", f"<p>Unknown company {_esc(name)}</p>")
        role_rows = "".join(
            f"<tr><td>{_esc(r['target_title'])}</td>"
            f"<td><span class=badge>{_esc(r['status'])}</span></td>"
            f"<td>{_esc(r.get('applied_on') or '')}</td>"
            + (f"<td><a href='/files/{_esc(r['resume_pdf'])}'>PDF</a></td>" if r.get("resume_pdf") else "<td>—</td>")
            + "</tr>"
            for r in detail["roles"]
        ) or "<tr><td colspan=4>No roles applied yet.</td></tr>"
        return _layout(detail["name"], f"""
<div class=card><p><b>Website:</b> {_esc(detail.get('website') or '—')} |
<b>Location:</b> {_esc(detail.get('location') or '—')}</p>
<p>{_esc(detail.get('about') or '')}</p>
<p><b>{detail['role_count']} role(s) applied.</b> By status: {_esc(json.dumps(detail['by_status']))}</p></div>
<table><tr><th>Role</th><th>Status</th><th>Applied</th><th>Resume</th></tr>{role_rows}</table>
<p><a href="/new?company={_esc(detail['name'])}">+ Tailor a resume for this company</a></p>""")

    @app.get("/roles", response_class=HTMLResponse)
    def roles_page() -> str:
        with db_session() as conn:
            roles = list_roles(conn)
            rows = "".join(
                f"<tr><td>{_esc(r['company_name'])}</td><td>{_esc(r['target_title'])}</td>"
                f"<td>{_esc(r['status'])}</td></tr>"
                for r in roles
            ) or "<tr><td colspan=3>None</td></tr>"
            return _layout("Roles", f"<table><tr><th>Company</th><th>Role</th><th>Status</th></tr>{rows}</table>")

    @app.get("/new", response_class=HTMLResponse)
    def new_page(company: str = "") -> str:
        return _layout("New application", f"""
<div class=card><form method=post action="/tailor">
<input name=company placeholder="Company" value="{_esc(company)}" required>
<input name=target_title placeholder="Target title (e.g. Software Engineer)" required>
<input name=job_url placeholder="Job posting URL (optional)">
<label>AI parsing <select name=provider>
<option value="auto" selected>Auto (LLM if key, else offline)</option>
<option value="gemini">Gemini</option>
<option value="glm">GLM</option>
<option value="deterministic">Offline only</option>
</select></label>
<textarea name=jd_text placeholder="Paste the full job description here…" required></textarea>
<input name=max_achievements placeholder="Max bullets (default 10)">
<input name=summary placeholder="Reviewed summary override (optional)">
<input name=font placeholder="Font (default Calibri)">
<button>Generate tailored resume + skill diff</button></form></div>""")

    @app.post("/tailor")
    async def tailor_post(request: Request):
        form = await request.form()
        company = str(form.get("company", "")).strip()
        target_title = str(form.get("target_title", "")).strip()
        jd_text = str(form.get("jd_text", ""))
        job_url = str(form.get("job_url", ""))
        if not company or not target_title or not jd_text.strip():
            return HTMLResponse(_layout("Error", "<p>Company, title and JD are required.</p>"), status_code=400)
        try:
            max_achievements = int(str(form.get("max_achievements", "") or 10))
        except ValueError:
            return HTMLResponse(_layout("Error", "<p>Max bullets must be a number.</p>"), status_code=400)
        summary = str(form.get("summary", "") or "").strip() or None
        font = str(form.get("font", "") or "").strip() or None
        from .jd_parser import parse_job_description
        from .llm import resolve_or_none

        try:
            provider_choice = str(form.get("provider", "auto") or "auto")
            provider, _, _ = resolve_or_none(provider_choice)
            profile = load_profile(profile_path)
            parsed = parse_job_description(
                profile, jd_text, provider=provider, target_title=target_title
            )
            plan = build_tailoring_plan(
                profile, jd_text, target_title=target_title,
                max_achievements=max_achievements,
                parsed_job_description=parsed,
            )
            from .resume_data import (
                build_resume_data,
                narrow_plan_ranking,
                select_resume_bullets,
                validate_resume_data,
            )

            select_provider, _, _ = resolve_or_none(provider_choice)
            selection = select_resume_bullets(
                plan, profile, provider=select_provider,
                max_select=max_achievements,
            )
            plan = narrow_plan_ranking(plan, selection["selected_ids"])
            rewrite_provider, _, _ = resolve_or_none(provider_choice)
            plan = rewrite_plan(
                plan, profile, provider=rewrite_provider, summary=summary
            )
            resume_data = build_resume_data(
                plan, profile, font=font, summary=summary
            )
            resume_data = validate_resume_data(resume_data, profile)["data"]
        except ValueError as error:
            return HTMLResponse(
                _layout("Error", f"<p>Cannot tailor this application: {_esc(error)}</p>"),
                status_code=400,
            )
        diff = build_skill_diff(plan, profile)
        content_hash = hashlib.sha256(
            f"{company}\0{target_title}\0{jd_text}".encode("utf-8")
        ).hexdigest()[:8]
        slug = f"{_slug(company)}-{_slug(target_title)}-{content_hash}"
        out_dir = outputs_dir / slug
        out_dir.mkdir(parents=True, exist_ok=True)
        pdf_path = out_dir / "resume.pdf"
        typ_path = out_dir / "resume.typ"
        try:
            adjusted, pdf = write_resume_data_pdf(
                plan, profile, pdf_path,
                data=resume_data,
                summary=summary, keep_source_path=typ_path,
            )
        except (ValueError, RuntimeError) as error:
            return HTMLResponse(
                _layout("Error", f"<p>Cannot render this resume: {_esc(error)}</p>"),
                status_code=400,
            )
        report = render_plan_markdown(adjusted, profile)
        from .diff import render_skill_diff_markdown

        report += render_skill_diff_markdown(diff)
        (out_dir / "resume-report.md").write_text(report, encoding="utf-8")
        (out_dir / "resume-plan.json").write_text(
            json.dumps({**adjusted, "skill_diff": diff, "pdf": pdf}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        with db_session() as conn:
            get_or_create = get_company(conn, company) or upsert_company(conn, company)
            _ = get_or_create
            add_role(
                conn, company, target_title, status="applied",
                job_url=job_url, jd_text=jd_text,
                resume_pdf=f"{slug}/resume.pdf",
                plan_json=f"{slug}/resume-plan.json",
            )
        diff_rows = "".join(
            f"<tr><td>{_esc(r['name'])}</td><td>{_esc(r['priority'])}</td>"
            f"<td>{_esc(r['status'])}</td></tr>"
            for group in (diff["have"], diff.get("inferred", []),
                          diff["partial_or_not_selected"],
                          diff["missing_no_evidence"], diff["unknown_jd_terms"])
            for r in group
        )
        return HTMLResponse(_layout(f"Tailored for {company}", f"""
<div class=card><p>{_esc(diff['summary'])}</p>
<p>Parsed with <b>{_esc(parsed.get('provider', 'deterministic'))}</b>
(requested {_esc(parsed.get('provider_requested', provider_choice))}).</p>
<p><a href="/files/{slug}/resume.pdf">Download resume PDF</a> |
<a href="/files/{slug}/resume.typ">Typst source (basic-resume:0.2.9)</a> |
<a href="/companies/{_esc(company)}">View { _esc(company)} tracker</a></p></div>
<h3>They expect vs you have</h3>
<table><tr><th>Skill</th><th>Priority</th><th>Status</th></tr>{diff_rows}</table>
<h3>What they expect that you don't have</h3>
<p>{_esc(', '.join(r['name'] for r in diff['missing_no_evidence'] + diff['unknown_jd_terms']) or 'Nothing — all covered!')}</p>"""))

    return app
