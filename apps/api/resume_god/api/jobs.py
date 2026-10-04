"""JSON API routers (M1): tailor, review, render, providers, profiles."""

from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from ..diff import build_skill_diff
from ..jd_parser import parse_job_description
from ..llm import active_provider_label, resolve_or_none
from ..rewrite import revalidate_plan_rewrites, rewrite_plan
from ..resume_data import (
    build_resume_data,
    narrow_plan_ranking,
    select_resume_bullets,
    validate_resume_data,
)
from ..tailor import build_tailoring_plan, load_profile
from ..typst import write_resume_data_pdf
from .schemas import (
    ProfileImportRequest,
    RenderRequest,
    ReviewRequest,
    ReviewResponse,
    TailorRequest,
    TailorResponse,
)

router = APIRouter(prefix="/api")

# Single-user resolve hook; Phase B3 swaps this for the session user.
PROFILE_PATH: Path | None = None


def get_profile_dict() -> dict[str, Any]:
    if PROFILE_PATH is None:  # pragma: no cover - wired by create_app
        raise HTTPException(status_code=500, detail="Profile path not configured")
    try:
        return load_profile(PROFILE_PATH)
    except (ValueError, FileNotFoundError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error))


def _resolve(requested: str):
    provider, requested_name, fallback_error = resolve_or_none(requested)
    return provider, requested_name, fallback_error


def _tailor_core(
    profile: dict[str, Any],
    jd_text: str,
    *,
    target_title: str | None,
    provider_choice: str,
    max_achievements: int,
    summary: str | None,
    font: str | None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    parser_provider, parser_req, parser_req_error = _resolve(provider_choice)
    try:
        parsed = parse_job_description(
            profile, jd_text, provider=parser_provider, target_title=target_title
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    parsed["provider_requested"] = parser_req
    if parser_req_error and not parsed.get("provider_fallback_error"):
        parsed["provider_fallback_error"] = parser_req_error

    plan = build_tailoring_plan(
        profile,
        jd_text,
        target_title=target_title or parsed["role_title"],
        max_achievements=max_achievements,
        parsed_job_description=parsed,
    )
    select_provider, select_req, select_req_error = _resolve(provider_choice)
    selection = select_resume_bullets(
        plan, profile, provider=select_provider, max_select=max_achievements
    )
    plan = narrow_plan_ranking(plan, selection["selected_ids"])
    plan["llm_selection"] = {
        **selection,
        "requested": select_req,
        "fallback_error": select_req_error or selection["fallback_error"],
    }
    rewrite_provider, rewrite_req, rewrite_req_error = _resolve(provider_choice)
    try:
        plan = rewrite_plan(
            plan, profile, provider=rewrite_provider, summary=summary
        )
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    plan["rewrite_provider_requested"] = rewrite_req
    if rewrite_req_error and not plan.get("rewrite_provider_fallback_error"):
        plan["rewrite_provider_fallback_error"] = rewrite_req_error
    diff = build_skill_diff(plan, profile)
    providers = {
        "parsing": {
            "requested": parser_req,
            "used": parsed.get("provider", "deterministic"),
            "fallback_error": parsed.get("provider_fallback_error"),
        },
        "selection": {
            "requested": select_req,
            "used": selection["provider"],
            "fallback_error": selection["fallback_error"] or select_req_error,
        },
        "rewriting": {
            "requested": rewrite_req,
            "used": plan.get("rewrite_provider", "deterministic"),
            "fallback_error": plan.get("rewrite_provider_fallback_error"),
        },
    }
    return plan, diff, providers


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/providers")
def providers() -> dict[str, Any]:
    return {
        "order": ["gemini", "glm"],
        "auto": active_provider_label("auto"),
        "models": {
            "gemini": "gemini-3-flash-preview",
            "glm": "glm-4.6",
        },
    }


@router.post("/tailor", response_model=TailorResponse)
def tailor(body: TailorRequest) -> dict[str, Any]:
    profile = get_profile_dict()
    plan, diff, providers = _tailor_core(
        profile,
        body.jd_text,
        target_title=body.target_title,
        provider_choice=body.provider,
        max_achievements=body.max_achievements,
        summary=body.summary,
        font=body.font,
    )
    return {"plan": plan, "skill_diff": diff, "providers": providers}


@router.post("/review", response_model=ReviewResponse)
def review(body: ReviewRequest) -> dict[str, Any]:
    from copy import deepcopy

    profile = get_profile_dict()
    plan = deepcopy(body.plan)
    for achievement_id, text in body.edits.rewritten_text.items():
        record = plan.get("rewrites", {}).get(achievement_id)
        if record is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown achievement in review edits: {achievement_id}",
            )
        record["rewritten_text"] = text
        record["used_rewrite"] = True
    try:
        rejected = revalidate_plan_rewrites(plan, profile)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    resume_data = build_resume_data(
        plan, profile, font=None, summary=body.edits.summary
    )
    validation = validate_resume_data(resume_data, profile)
    return {
        "plan": plan,
        "rejected_edits": rejected,
        "resume_data": validation["data"],
        "validation": {
            "dropped_bullets": validation["dropped_bullets"],
            "fallback_bullets": validation["fallback_bullets"],
            "issues": validation["issues"],
        },
    }


@router.post("/render")
def render(body: RenderRequest) -> Response:
    from copy import deepcopy

    profile = get_profile_dict()
    plan = deepcopy(body.plan)
    try:
        rejected = revalidate_plan_rewrites(plan, profile)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    resume_data = build_resume_data(
        plan, profile, font=body.font, summary=body.summary
    )
    validation = validate_resume_data(resume_data, profile)
    with tempfile.TemporaryDirectory(prefix="resume-god-api-") as directory:
        output = Path(directory) / "resume.pdf"
        try:
            _, pdf = write_resume_data_pdf(
                plan, profile, output, data=validation["data"], summary=body.summary
            )
        except (ValueError, RuntimeError) as error:
            raise HTTPException(status_code=400, detail=str(error))
        content = output.read_bytes()
    headers = {
        "X-Rejected-Edits": ",".join(rejected),
        "X-Trimmed": ",".join(pdf["trimmed_for_one_page"]),
    }
    return Response(content=content, media_type="application/pdf", headers=headers)


def _db_session_factory():
    from ..db import make_session_factory

    return make_session_factory()


@router.get("/profiles")
def profile_versions() -> dict[str, Any]:
    from ..db import ensure_owner
    from ..profiles import get_active_profile, list_profiles

    with _db_session_factory()() as session:
        user = ensure_owner(session)
        versions = list_profiles(session, user.id)
        active = get_active_profile(session, user.id)
    return {
        "versions": versions,
        "has_active": active is not None,
        "active_status": (active or {}).get("status"),
    }


@router.post("/profiles/import")
def profile_import(body: ProfileImportRequest) -> dict[str, Any]:
    from ..db import ensure_owner
    from ..profiles import import_profile

    try:
        profile = yaml.safe_load(body.profile_yaml)
    except yaml.YAMLError as error:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {error}")
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="Profile YAML must be a mapping")
    with _db_session_factory()() as session:
        user = ensure_owner(session)
        try:
            row = import_profile(session, user.id, profile)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error))
    return {"version": row.version, "status": row.status, "is_active": True}
