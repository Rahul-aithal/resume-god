"""Pydantic schemas for the resume-god JSON API (M1).

The SPA drives tailor -> review -> render with these shapes. Plans are
passed by value (the client holds the reviewed JSON); persistence lands
with Phase B4. Pydantic validates the envelope only — grounding rules
stay in the core validators.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

ProviderName = Literal["auto", "deterministic", "glm", "gemini"]


class TailorRequest(BaseModel):
    jd_text: str = Field(min_length=1)
    target_title: str | None = None
    provider: ProviderName = "auto"
    max_achievements: int = Field(default=10, ge=1, le=50)
    summary: str | None = None
    font: str | None = None
    company_id: int | None = None
    company_name: str | None = None
    job_url: str | None = None
    role_status: str = "applied"


class TailorResponse(BaseModel):
    plan: dict[str, Any]
    skill_diff: dict[str, Any]
    providers: dict[str, Any]
    role_id: int | None = None


class ReviewEdits(BaseModel):
    rewritten_text: dict[str, str] = Field(default_factory=dict)
    summary: str | None = None


class ReviewRequest(BaseModel):
    plan: dict[str, Any]
    edits: ReviewEdits = Field(default_factory=ReviewEdits)


class ReviewResponse(BaseModel):
    plan: dict[str, Any]
    rejected_edits: list[str]
    resume_data: dict[str, Any]
    validation: dict[str, Any]


class RenderRequest(BaseModel):
    plan: dict[str, Any]
    summary: str | None = None
    font: str | None = None


class ProfileImportRequest(BaseModel):
    profile_yaml: str = Field(min_length=1)


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1)
    website: str | None = None
    location: str | None = None
    about: str | None = None
    notes: str | None = None


class RoleCreate(BaseModel):
    company_id: int
    target_title: str = Field(min_length=1)
    status: str = "applied"
    job_url: str | None = None
    salary: str | None = None
    location: str | None = None
    notes: str | None = None


class RoleUpdate(BaseModel):
    status: str | None = None
    job_url: str | None = None
    salary: str | None = None
    location: str | None = None
    notes: str | None = None


class SettingsUpdate(BaseModel):
    llm_order: str | None = None
    gemini_model: str | None = None
    glm_model: str | None = None
    default_font: str | None = None
