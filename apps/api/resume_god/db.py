"""Postgres/SQLite data layer for multi-user resume-god (SQLAlchemy 2.0).

Single-user installations get an implicit owner row; every tenant table
carries user_id so auth (Phase B3) only needs to scope queries. The legacy
raw-sqlite tracker (store.py) keeps working untouched; new code goes here.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), default="")
    oauth_subject: Mapped[str | None] = mapped_column(String(320), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class Profile(Base):
    """Versioned master profiles; the pipeline pins one version per run."""

    __tablename__ = "profiles"
    __table_args__ = (UniqueConstraint("user_id", "version"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="draft")
    profile_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class Company(Base):
    __tablename__ = "companies"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    website: Mapped[str] = mapped_column(String(500), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    about: Mapped[str] = mapped_column(Text, default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("company_id", "target_title"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    target_title: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="applied")
    job_url: Mapped[str] = mapped_column(String(1000), default="")
    salary: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class Application(Base):
    """Immutable apply/status history; roles hold the current state."""

    __tablename__ = "applications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="applied")
    job_url: Mapped[str] = mapped_column(String(1000), default="")
    salary: Mapped[str] = mapped_column(String(200), default="")
    location: Mapped[str] = mapped_column(String(200), default="")
    jd_text: Mapped[str] = mapped_column(Text, default="")
    resume_pdf: Mapped[str] = mapped_column(String(1000), default="")
    plan_json: Mapped[str] = mapped_column(String(1000), default="")
    applied_on: Mapped[str] = mapped_column(String(20), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class Artifact(Base):
    """Registry of generated files (plan JSON, PDF, report, typst)."""

    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    role_id: Mapped[int | None] = mapped_column(ForeignKey("roles.id"))
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    path: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), unique=True, nullable=False
    )
    llm_order: Mapped[str] = mapped_column(String(100), default="gemini,glm")
    gemini_model: Mapped[str] = mapped_column(
        String(100), default="gemini-3-flash-preview"
    )
    glm_model: Mapped[str] = mapped_column(String(100), default="glm-4.6")
    default_font: Mapped[str] = mapped_column(String(100), default="Calibri")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


def database_url(explicit: str | None = None) -> str:
    """Resolve the app database URL (Postgres, else local SQLite file)."""
    configured = explicit or os.environ.get("DATABASE_URL")
    if configured:
        return configured
    data_dir = Path(__file__).resolve().parents[1] / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{data_dir / 'app.db'}"


def make_engine(url: str | None = None):
    return create_engine(database_url(url))


def make_session_factory(url: str | None = None):
    return sessionmaker(bind=make_engine(url), expire_on_commit=False)


def ensure_owner(session, *, email: str = "owner@local", display_name: str = "Owner") -> User:
    """Fetch or create the implicit single-user owner row."""
    user = session.query(User).filter_by(email=email).one_or_none()
    if user is None:
        user = User(email=email, display_name=display_name)
        session.add(user)
        session.commit()
    return user
