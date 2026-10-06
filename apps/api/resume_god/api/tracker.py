"""Per-user tracker API (B4): companies, roles, application history.

Backed by the Postgres/SQLite app database (db.Company/Role/Application);
the legacy SQLite tracker (store.py) keeps its CLI/web pages untouched.
Every query is scoped by user_id so tenants never see each other's data.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError

from ..db import Application, Company, Role
from .auth import require_user
from .schemas import CompanyCreate, RoleCreate, RoleUpdate

router = APIRouter(prefix="/api")

ROLE_STATUSES = ("wishlist", "applied", "oa", "interview", "offer", "rejected")


def _session():
    from ..db import make_session_factory

    return make_session_factory()()


def _company_dict(company: Company, role_count: int = 0) -> dict[str, Any]:
    return {
        "id": company.id,
        "name": company.name,
        "website": company.website,
        "location": company.location,
        "about": company.about,
        "notes": company.notes,
        "role_count": role_count,
        "created_at": company.created_at.isoformat() if company.created_at else None,
        "updated_at": company.updated_at.isoformat() if company.updated_at else None,
    }


def _role_dict(role: Role, company_name: str | None = None) -> dict[str, Any]:
    data = {
        "id": role.id,
        "company_id": role.company_id,
        "target_title": role.target_title,
        "status": role.status,
        "job_url": role.job_url,
        "salary": role.salary,
        "location": role.location,
        "notes": role.notes,
        "created_at": role.created_at.isoformat() if role.created_at else None,
    }
    if company_name is not None:
        data["company_name"] = company_name
    return data


def _application_dict(row: Application) -> dict[str, Any]:
    return {
        "id": row.id,
        "role_id": row.role_id,
        "status": row.status,
        "job_url": row.job_url,
        "salary": row.salary,
        "location": row.location,
        "applied_on": row.applied_on,
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def _get_company(session, user_id: int, company_id: int) -> Company:
    company = (
        session.query(Company).filter_by(user_id=user_id, id=company_id).one_or_none()
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _get_role(session, user_id: int, role_id: int) -> Role:
    role = session.query(Role).filter_by(user_id=user_id, id=role_id).one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.get("/companies")
def list_companies(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    with _session() as session:
        counts = dict(
            session.query(Role.company_id, func.count(Role.id))
            .filter(Role.user_id == user["id"])
            .group_by(Role.company_id)
            .all()
        )
        rows = (
            session.query(Company)
            .filter_by(user_id=user["id"])
            .order_by(Company.name)
            .all()
        )
        return {
            "companies": [_company_dict(row, counts.get(row.id, 0)) for row in rows]
        }


@router.post("/companies")
def create_company(
    body: CompanyCreate, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Company name is required")
    with _session() as session:
        existing = (
            session.query(Company)
            .filter_by(user_id=user["id"], name=name)
            .one_or_none()
        )
        if existing is None:
            company = Company(
                user_id=user["id"],
                name=name,
                website=body.website or "",
                location=body.location or "",
                about=body.about or "",
                notes=body.notes or "",
            )
            session.add(company)
        else:
            company = existing
            for field in ("website", "location", "about", "notes"):
                value = getattr(body, field)
                if value is not None:
                    setattr(company, field, value)
        try:
            session.commit()
        except SQLAlchemyError as error:
            raise HTTPException(status_code=503, detail=f"Database error: {error}")
        return _company_dict(company)


@router.get("/companies/{company_id}")
def company_detail(
    company_id: int, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    with _session() as session:
        company = _get_company(session, user["id"], company_id)
        roles = (
            session.query(Role)
            .filter_by(user_id=user["id"], company_id=company_id)
            .order_by(Role.created_at.desc())
            .all()
        )
        by_status: dict[str, int] = {}
        for role in roles:
            by_status[role.status] = by_status.get(role.status, 0) + 1
        return {
            **_company_dict(company, len(roles)),
            "roles": [_role_dict(role, company.name) for role in roles],
            "by_status": by_status,
        }


@router.get("/roles")
def list_roles(
    company_id: int | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    if limit < 1 or limit > 500:
        raise HTTPException(status_code=400, detail="limit must be 1..500")
    with _session() as session:
        query = session.query(Role, Company.name).join(
            Company, Role.company_id == Company.id
        ).filter(Role.user_id == user["id"])
        if company_id is not None:
            query = query.filter(Role.company_id == company_id)
        if status:
            query = query.filter(Role.status == status)
        rows = query.order_by(Role.created_at.desc()).offset(offset).limit(limit).all()
        return {
            "roles": [_role_dict(role, name) for role, name in rows]
        }


@router.post("/roles")
def create_role(
    body: RoleCreate, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    title = body.target_title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Target title is required")
    if body.status not in ROLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown status: {body.status}. Use one of {', '.join(ROLE_STATUSES)}",
        )
    with _session() as session:
        _get_company(session, user["id"], body.company_id)
        duplicate = (
            session.query(Role)
            .filter_by(user_id=user["id"], company_id=body.company_id, target_title=title)
            .one_or_none()
        )
        if duplicate is not None:
            raise HTTPException(
                status_code=409,
                detail="This company already has a role with that title",
            )
        role = Role(
            user_id=user["id"],
            company_id=body.company_id,
            target_title=title,
            status=body.status,
            job_url=body.job_url or "",
            salary=body.salary or "",
            location=body.location or "",
            notes=body.notes or "",
        )
        session.add(role)
        session.flush()
        session.add(
            Application(
                user_id=user["id"],
                role_id=role.id,
                status=role.status,
                job_url=role.job_url,
                salary=role.salary,
                location=role.location,
                notes=role.notes,
            )
        )
        session.commit()
        return _role_dict(role)


@router.patch("/roles/{role_id}")
def update_role(
    role_id: int,
    body: RoleUpdate,
    user: dict[str, Any] = Depends(require_user),
) -> dict[str, Any]:
    if body.status is not None and body.status not in ROLE_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown status: {body.status}. Use one of {', '.join(ROLE_STATUSES)}",
        )
    with _session() as session:
        role = _get_role(session, user["id"], role_id)
        changed_status = False
        for field in ("status", "job_url", "salary", "location", "notes"):
            value = getattr(body, field)
            if value is None:
                continue
            if field == "status" and value != role.status:
                changed_status = True
            setattr(role, field, value)
        if changed_status:
            session.add(
                Application(
                    user_id=user["id"],
                    role_id=role.id,
                    status=role.status,
                    job_url=role.job_url,
                    salary=role.salary,
                    location=role.location,
                    notes=role.notes,
                )
            )
        session.commit()
        return _role_dict(role)


@router.get("/roles/{role_id}/history")
def role_history(
    role_id: int, user: dict[str, Any] = Depends(require_user)
) -> dict[str, Any]:
    with _session() as session:
        role = _get_role(session, user["id"], role_id)
        rows = (
            session.query(Application)
            .filter_by(role_id=role.id)
            .order_by(Application.created_at, Application.id)
            .all()
        )
        return {"role": _role_dict(role), "history": [_application_dict(row) for row in rows]}


@router.get("/dashboard")
def dashboard(user: dict[str, Any] = Depends(require_user)) -> dict[str, Any]:
    with _session() as session:
        company_count = (
            session.query(func.count(Company.id)).filter_by(user_id=user["id"]).scalar()
        ) or 0
        role_count = (
            session.query(func.count(Role.id)).filter_by(user_id=user["id"]).scalar()
        ) or 0
        by_status_rows = (
            session.query(Role.status, func.count(Role.id))
            .filter(Role.user_id == user["id"])
            .group_by(Role.status)
            .all()
        )
        by_status = {status: count for status, count in by_status_rows}
        recent = (
            session.query(Role, Company.name)
            .join(Company, Role.company_id == Company.id)
            .filter(Role.user_id == user["id"])
            .order_by(Role.created_at.desc())
            .limit(10)
            .all()
        )
        artifacts: list[dict[str, Any]] = []
        try:
            from ..db import Artifact

            artifact_rows = (
                session.query(Artifact)
                .filter_by(user_id=user["id"])
                .order_by(Artifact.created_at.desc())
                .limit(8)
                .all()
            )
            artifacts = [
                {
                    "id": row.id,
                    "kind": row.kind,
                    "path": row.path,
                    "created_at": row.created_at.isoformat() if row.created_at else None,
                }
                for row in artifact_rows
            ]
        except SQLAlchemyError:
            pass
        return {
            "company_count": company_count,
            "role_count": role_count,
            "by_status": by_status,
            "recent_roles": [_role_dict(role, name) for role, name in recent],
            "recent_artifacts": artifacts,
        }
