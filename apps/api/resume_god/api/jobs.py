"""JSON API routers (M1): tailor, review, render, providers, profiles."""

from __future__ import annotations

import tempfile
import uuid
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from .auth import require_user
from ..diff import build_skill_diff
from ..jd_parser import parse_job_description
from ..llm import (
    active_provider_label,
    attempt_each,
    resolve_provider_list,
)
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
    CompanyCreate,
    ProfileImportRequest,
    RenderRequest,
    ReviewRequest,
    ReviewResponse,
    RoleCreate,
    RoleUpdate,
    SettingsUpdate,
    TailorRequest,
    TailorResponse,
)

router = APIRouter(prefix="/api")

# Wired by create_app (single-user file fallback); DB profile wins per user.
PROFILE_PATH: Path | None = None
OUTPUTS_DIR: Path | None = None

DEFAULT_SETTINGS = {
    "llm_order": "gemini,glm",
    "gemini_model": "gemini-3-flash-preview",
    "glm_model": "glm-4.6",
    "default_font": "Calibri",
}

ROLE_STATUSES = ("wishlist", "applied", "oa", "interview", "offer", "rejected")


def _db_user(session, claims: dict[str, Any]):
    """Fetch the session user row, creating it for first-seen claims."""
    from ..db import User

    user = session.get(User, claims["id"])
    if user is None:
        user = User(
            email=str(claims.get("email") or "unknown@local"),
            display_name=str(claims.get("display_name") or ""),
        )
        session.add(user)
        session.commit()
    return user


def _user_settings(user: dict[str, Any]) -> dict[str, Any]:
    """Per-user settings with safe defaults on fresh/unmigrated DBs."""
    try:
        from ..db import make_session_factory
        from ..db import UserSettings

        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            row = session.query(UserSettings).filter_by(user_id=db_user.id).one_or_none()
            if row is not None:
                return {
                    "llm_order": row.llm_order,
                    "gemini_model": row.gemini_model,
                    "glm_model": row.glm_model,
                    "default_font": row.default_font,
                }
    except Exception:
        pass
    return dict(DEFAULT_SETTINGS)


def _request_profile(user: dict[str, Any]) -> dict[str, Any]:
    """DB active profile for the user, else the configured file."""
    try:
        from ..db import make_session_factory
        from ..profiles import get_active_profile

        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            active = get_active_profile(session, db_user.id)
            if active:
                return active
    except Exception:
        pass
    return get_profile_dict()


def _persist_artifact(
    user: dict[str, Any], kind: str, filename: str, content: bytes,
    role_id: int | None = None,
) -> str:
    """Store a generated file and registry row; returns the relative path.

    Best-effort: returns "" when outputs are unconfigured or the app DB
    is unavailable (fresh checkouts keep working).
    """
    if OUTPUTS_DIR is None:
        return ""
    subdir = OUTPUTS_DIR / "api" / str(user.get("id", "unknown"))
    subdir.mkdir(parents=True, exist_ok=True)
    path = subdir / f"{uuid.uuid4().hex[:8]}-{filename}"
    path.write_bytes(content)
    try:
        from ..db import Artifact, make_session_factory

        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            session.add(
                Artifact(user_id=db_user.id, kind=kind, path=str(path), role_id=role_id)
            )
            session.commit()
    except Exception:
        pass
    return str(path)


def _link_role(
    user: dict[str, Any],
    body: TailorRequest,
    target_title: str,
    plan_path: str,
    *,
    append_history: bool = True,
) -> int | None:
    """Attach the tailored run to a company role, creating both as needed.

    Best-effort: returns None when the app DB is unavailable so a fresh
    checkout can still tailor without a tracker. Call once with
    append_history=True to create the role and history row, then again
    with False to attach the persisted plan path.
    """
    try:
        from ..db import Application, Company, Role, make_session_factory

        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            company = None
            if body.company_id is not None:
                company = (
                    session.query(Company)
                    .filter_by(user_id=db_user.id, id=body.company_id)
                    .one_or_none()
                )
                if company is None:
                    raise HTTPException(
                        status_code=404, detail=f"Company {body.company_id} not found"
                    )
            else:
                name = (body.company_name or "").strip()
                if name:
                    company = (
                        session.query(Company)
                        .filter_by(user_id=db_user.id, name=name)
                        .one_or_none()
                    )
                    if company is None:
                        company = Company(user_id=db_user.id, name=name)
                        session.add(company)
                        session.flush()
            if company is None:
                return None
            role = (
                session.query(Role)
                .filter_by(user_id=db_user.id, company_id=company.id, target_title=target_title)
                .one_or_none()
            )
            if role is None:
                role = Role(
                    user_id=db_user.id,
                    company_id=company.id,
                    target_title=target_title,
                    status=body.role_status,
                    job_url=body.job_url or "",
                )
                session.add(role)
                session.flush()
            if append_history:
                session.add(
                    Application(
                        user_id=db_user.id,
                        role_id=role.id,
                        status=role.status,
                        job_url=body.job_url or role.job_url,
                        resume_pdf=plan_path,
                    )
                )
            elif plan_path:
                latest = (
                    session.query(Application)
                    .filter_by(role_id=role.id)
                    .order_by(Application.id.desc())
                    .first()
                )
                if latest is not None:
                    latest.resume_pdf = plan_path
            session.commit()
            return role.id
    except HTTPException:
        raise
    except Exception:
        return None


def get_profile_dict() -> dict[str, Any]:
    if PROFILE_PATH is None:  # pragma: no cover - wired by create_app
        raise HTTPException(status_code=500, detail="Profile path not configured")
    try:
        return load_profile(PROFILE_PATH)
    except (ValueError, FileNotFoundError, KeyError) as error:
        raise HTTPException(status_code=400, detail=str(error))


def _tailor_core(
    profile: dict[str, Any],
    jd_text: str,
    *,
    target_title: str | None,
    provider_choice: str,
    max_achievements: int,
    summary: str | None,
    font: str | None,
    order: list[str] | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    parser_providers, parser_req, parser_req_error = resolve_provider_list(
        provider_choice, order=order
    )

    def _parse(provider):
        parsed = parse_job_description(
            profile, jd_text, provider=provider, target_title=target_title
        )
        ok = parsed.get("provider", "deterministic") != "deterministic"
        return parsed, ok, parsed.get("provider_fallback_error") or ""

    try:
        parsed, _, parser_chain = attempt_each(parser_providers, _parse)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    parsed["provider_requested"] = parser_req
    chain_error = "; ".join(
        [error for error in [parser_req_error, *parser_chain] if error]
    )
    if chain_error and not parsed.get("provider_fallback_error"):
        parsed["provider_fallback_error"] = chain_error

    try:
        plan = build_tailoring_plan(
            profile,
            jd_text,
            target_title=target_title or parsed["role_title"],
            max_achievements=max_achievements,
            parsed_job_description=parsed,
        )
    except ValueError as error:
        # Validation problems (e.g. target title vs JD title mismatch) are
        # client-fixable inputs, not server crashes.
        raise HTTPException(status_code=422, detail=str(error))
    select_providers, select_req, select_req_error = resolve_provider_list(
        provider_choice, order=order
    )

    def _select(provider):
        selection = select_resume_bullets(
            plan, profile, provider=provider, max_select=max_achievements
        )
        ok = selection["provider"] != "deterministic"
        return selection, ok, selection.get("fallback_error") or ""

    selection, _, select_chain = attempt_each(select_providers, _select)
    plan = narrow_plan_ranking(plan, selection["selected_ids"])
    plan["llm_selection"] = {
        **selection,
        "requested": select_req,
        "fallback_error": "; ".join(
            [error for error in [select_req_error, *select_chain] if error]
        )
        or None,
    }
    rewrite_providers, rewrite_req, rewrite_req_error = resolve_provider_list(
        provider_choice, order=order
    )

    def _rewrite(provider):
        rewritten = rewrite_plan(
            plan, profile, provider=provider, summary=summary
        )
        ok = rewritten.get("rewrite_provider", "deterministic") != "deterministic"
        return (
            rewritten,
            ok,
            rewritten.get("rewrite_provider_fallback_error") or "",
        )

    try:
        plan, _, rewrite_chain = attempt_each(rewrite_providers, _rewrite)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    plan["rewrite_provider_requested"] = rewrite_req
    rewrite_chain_error = "; ".join(
        [error for error in [rewrite_req_error, *rewrite_chain] if error]
    )
    if rewrite_chain_error and not plan.get("rewrite_provider_fallback_error"):
        plan["rewrite_provider_fallback_error"] = rewrite_chain_error
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
def providers(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    settings = _user_settings(user)
    order = [item.strip() for item in settings["llm_order"].split(",") if item.strip()]
    return {
        "order": order or ["gemini", "glm"],
        "auto": active_provider_label("auto"),
        "models": {
            "gemini": settings["gemini_model"],
            "glm": settings["glm_model"],
        },
        "default_font": settings["default_font"],
    }


@router.get("/settings")
def get_settings(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    return _user_settings(user)


@router.put("/settings")
def update_settings(
    body: SettingsUpdate, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    from sqlalchemy.exc import SQLAlchemyError

    from ..db import UserSettings, make_session_factory

    if body.llm_order is not None:
        cleaned = [item.strip().lower() for item in body.llm_order.split(",") if item.strip()]
        invalid = [item for item in cleaned if item not in ("gemini", "glm")]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown providers in llm_order: {', '.join(invalid)} (use gemini/glm)",
            )
        if not cleaned:
            raise HTTPException(status_code=400, detail="llm_order cannot be empty")
        body.llm_order = ",".join(cleaned)
    try:
        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            row = (
                session.query(UserSettings)
                .filter_by(user_id=db_user.id)
                .one_or_none()
            )
            if row is None:
                row = UserSettings(user_id=db_user.id)
                session.add(row)
            for field in ("llm_order", "gemini_model", "glm_model", "default_font"):
                value = getattr(body, field)
                if value is not None:
                    setattr(row, field, value)
            session.commit()
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=503,
            detail=f"App database unavailable (run 'resume-god db migrate'): {error}",
        )
    return _user_settings(user)


@router.post("/tailor", response_model=TailorResponse)
def tailor(
    body: TailorRequest, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    import json as _json

    if body.role_status not in ROLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown role_status: {body.role_status}. Use one of {', '.join(ROLE_STATUSES)}",
        )
    profile = _request_profile(user)
    settings = _user_settings(user)
    order = [item.strip() for item in settings["llm_order"].split(",") if item.strip()]
    plan, diff, providers = _tailor_core(
        profile,
        body.jd_text,
        target_title=body.target_title,
        provider_choice=body.provider,
        max_achievements=body.max_achievements,
        summary=body.summary,
        font=body.font or settings["default_font"],
        order=order,
    )
    target_title = body.target_title or str(plan.get("target_title") or "Role")
    role_id = _link_role(user, body, target_title, "")
    path = _persist_artifact(
        user,
        "plan",
        "resume-plan.json",
        _json.dumps(
            {**plan, "skill_diff": diff, "providers": providers},
            ensure_ascii=False,
            indent=2,
        ).encode("utf-8"),
        role_id=role_id,
    )
    if role_id is not None:
        _link_role(user, body, target_title, path, append_history=False)
    return {
        "plan": plan,
        "skill_diff": diff,
        "providers": {**providers, "artifact": path},
        "role_id": role_id,
    }


@router.post("/review", response_model=ReviewResponse)
def review(
    body: ReviewRequest, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    from copy import deepcopy

    profile = _request_profile(user)
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
def render(
    body: RenderRequest, user: dict[str, Any] = Depends(require_user)
) -> Response:
    from copy import deepcopy

    profile = _request_profile(user)
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
    _persist_artifact(user, "pdf", "resume.pdf", content)
    headers = {
        "X-Rejected-Edits": ",".join(rejected),
        "X-Trimmed": ",".join(pdf["trimmed_for_one_page"]),
    }
    return Response(content=content, media_type="application/pdf", headers=headers)


def _db_session_factory():
    from ..db import make_session_factory

    return make_session_factory()


@router.get("/profiles")
def profile_versions(
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    from sqlalchemy.exc import SQLAlchemyError

    from ..db import make_session_factory
    from ..profiles import get_active_profile, list_profiles

    try:
        with make_session_factory()() as session:
            db_user = _db_user(session, user)
            versions = list_profiles(session, db_user.id)
            active = get_active_profile(session, db_user.id)
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=503,
            detail=f"App database unavailable (run 'resume-god db migrate'): {error}",
        )
    return {
        "versions": versions,
        "has_active": active is not None,
        "active_status": (active or {}).get("status"),
    }


@router.post("/profiles/import")
def profile_import(
    body: ProfileImportRequest, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    from sqlalchemy.exc import SQLAlchemyError

    from ..profiles import import_profile

    try:
        profile = yaml.safe_load(body.profile_yaml)
    except yaml.YAMLError as error:
        raise HTTPException(status_code=400, detail=f"Invalid YAML: {error}")
    if not isinstance(profile, dict):
        raise HTTPException(status_code=400, detail="Profile YAML must be a mapping")
    try:
        with _db_session_factory()() as session:
            db_user = _db_user(session, user)
            try:
                row = import_profile(session, db_user.id, profile)
            except ValueError as error:
                raise HTTPException(status_code=400, detail=str(error))
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=503,
            detail=f"App database unavailable (run 'resume-god db migrate'): {error}",
        )
    return {"version": row.version, "status": row.status, "is_active": True}
