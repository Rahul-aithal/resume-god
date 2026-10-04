"""Versioned profile store: YAML import, active pinning, dict output.

The pipeline consumes plain dicts, so a DB-backed profile is a drop-in
replacement for load_profile(). Every import is a new immutable version;
exactly one version per user is active. Rendering still requires
status == "user_reviewed" (enforced at render time, not import time, so
drafts can be staged).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db import Profile, ensure_owner

REQUIRED_TOP_LEVEL = (
    "skills",
    "achievements",
    "experiences",
    "projects",
    "contact",
)


def validate_profile_dict(profile: dict[str, Any]) -> list[str]:
    """Return blocking issues with a profile dict (empty = importable)."""
    issues: list[str] = []
    for key in REQUIRED_TOP_LEVEL:
        if not isinstance(profile.get(key), (list, dict)):
            issues.append(f"profile is missing section: {key}")
    return issues


def import_profile(
    session: Session, user_id: int, profile: dict[str, Any]
) -> Profile:
    """Store a new immutable version and make it active."""
    issues = validate_profile_dict(profile)
    if issues:
        raise ValueError("; ".join(issues))
    max_version = session.scalar(
        select(func.max(Profile.version)).where(Profile.user_id == user_id)
    ) or 0
    session.query(Profile).filter_by(user_id=user_id, is_active=True).update(
        {"is_active": False}
    )
    row = Profile(
        user_id=user_id,
        version=max_version + 1,
        status=str(profile.get("status", "draft")),
        profile_json=profile,
        is_active=True,
    )
    session.add(row)
    session.commit()
    return row


def get_active_profile(session: Session, user_id: int) -> dict[str, Any] | None:
    row = (
        session.query(Profile)
        .filter_by(user_id=user_id, is_active=True)
        .order_by(Profile.version.desc())
        .first()
    )
    return dict(row.profile_json) if row else None


def get_profile_version(
    session: Session, user_id: int, version: int
) -> dict[str, Any] | None:
    row = (
        session.query(Profile)
        .filter_by(user_id=user_id, version=version)
        .first()
    )
    return dict(row.profile_json) if row else None


def list_profiles(session: Session, user_id: int) -> list[dict[str, Any]]:
    rows = (
        session.query(Profile)
        .filter_by(user_id=user_id)
        .order_by(Profile.version.desc())
        .all()
    )
    return [
        {
            "version": row.version,
            "status": row.status,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat()
            if row.created_at is not None
            else None,
        }
        for row in rows
    ]


def import_profile_for_owner(
    session: Session, profile: dict[str, Any], *, email: str = "owner@local"
) -> Profile:
    """Single-user convenience: import against the implicit owner."""
    return import_profile(session, ensure_owner(session, email=email).id, profile)
