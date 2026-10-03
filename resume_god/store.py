"""SQLite tracker for companies and applied roles.

Small local DB so Rahul can see, per company: all stored company data,
how many roles were applied to, and which roles they were.
"""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  website TEXT DEFAULT '',
  location TEXT DEFAULT '',
  about TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'applied',
  job_url TEXT DEFAULT '',
  salary TEXT DEFAULT '',
  location TEXT DEFAULT '',
  jd_text TEXT DEFAULT '',
  resume_pdf TEXT DEFAULT '',
  plan_json TEXT DEFAULT '',
  applied_on TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE(company_id, target_title)
);
CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
"""

ROLE_STATUSES = (
    "wishlist",
    "applied",
    "oa",
    "interview",
    "offer",
    "rejected",
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def connect(db_path: str | Path) -> sqlite3.Connection:
    path = Path(db_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(SCHEMA)
    return conn


def upsert_company(
    conn: sqlite3.Connection,
    name: str,
    *,
    website: str = "",
    location: str = "",
    about: str = "",
    notes: str = "",
) -> dict[str, Any]:
    name = name.strip()
    if not name:
        raise ValueError("Company name must be non-empty")
    now = _now()
    conn.execute(
        """INSERT INTO companies (name, website, location, about, notes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(name) DO UPDATE SET
             website=excluded.website, location=excluded.location,
             about=excluded.about, notes=excluded.notes, updated_at=excluded.updated_at""",
        (name, website, location, about, notes, now, now),
    )
    conn.commit()
    return get_company(conn, name)  # type: ignore[return-value]


def get_company(conn: sqlite3.Connection, name: str) -> dict[str, Any] | None:
    row = conn.execute("SELECT * FROM companies WHERE name = ?", (name.strip(),)).fetchone()
    return dict(row) if row else None


def list_companies(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(
        """SELECT c.*, COUNT(r.id) AS role_count,
                  SUM(CASE WHEN r.status = 'applied' THEN 1 ELSE 0 END) AS applied_count
           FROM companies c LEFT JOIN roles r ON r.company_id = c.id
           GROUP BY c.id ORDER BY c.name"""
    ).fetchall()
    return [dict(row) for row in rows]


def company_detail(conn: sqlite3.Connection, name: str) -> dict[str, Any] | None:
    company = get_company(conn, name)
    if not company:
        return None
    roles = conn.execute(
        "SELECT * FROM roles WHERE company_id = ? ORDER BY created_at DESC",
        (company["id"],),
    ).fetchall()
    role_dicts = [dict(row) for row in roles]
    by_status: dict[str, int] = {}
    for role in role_dicts:
        by_status[role["status"]] = by_status.get(role["status"], 0) + 1
    return {
        **company,
        "role_count": len(role_dicts),
        "roles": role_dicts,
        "by_status": by_status,
    }


def add_role(
    conn: sqlite3.Connection,
    company_name: str,
    target_title: str,
    *,
    status: str = "applied",
    job_url: str = "",
    salary: str = "",
    location: str = "",
    jd_text: str = "",
    resume_pdf: str = "",
    plan_json: str = "",
    applied_on: str = "",
    notes: str = "",
) -> dict[str, Any]:
    if status not in ROLE_STATUSES:
        raise ValueError(f"status must be one of {', '.join(ROLE_STATUSES)}")
    target_title = target_title.strip()
    if not target_title:
        raise ValueError("target_title must be non-empty")
    company = get_company(conn, company_name)
    if not company:
        company = upsert_company(conn, company_name)
    now = _now()
    conn.execute(
        """INSERT INTO roles
           (company_id, target_title, status, job_url, salary, location,
            jd_text, resume_pdf, plan_json, applied_on, notes, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(company_id, target_title) DO UPDATE SET
             status=excluded.status, job_url=excluded.job_url,
             salary=excluded.salary, location=excluded.location,
             jd_text=excluded.jd_text, resume_pdf=excluded.resume_pdf,
             plan_json=excluded.plan_json, applied_on=excluded.applied_on,
             notes=excluded.notes""",
        (
            company["id"], target_title, status, job_url, salary, location,
            jd_text, resume_pdf, plan_json, applied_on or now[:10], notes, now,
        ),
    )
    conn.commit()
    row = conn.execute(
        "SELECT * FROM roles WHERE company_id = ? AND target_title = ?",
        (company["id"], target_title),
    ).fetchone()
    return dict(row)


def set_role_status(
    conn: sqlite3.Connection, role_id: int, status: str
) -> dict[str, Any]:
    if status not in ROLE_STATUSES:
        raise ValueError(f"status must be one of {', '.join(ROLE_STATUSES)}")
    conn.execute("UPDATE roles SET status = ? WHERE id = ?", (status, role_id))
    conn.commit()
    row = conn.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
    if not row:
        raise ValueError(f"Unknown role id: {role_id}")
    return dict(row)


def list_roles(
    conn: sqlite3.Connection, *, company_name: str | None = None
) -> list[dict[str, Any]]:
    if company_name:
        company = get_company(conn, company_name)
        if not company:
            return []
        rows = conn.execute(
            """SELECT r.*, c.name AS company_name FROM roles r
               JOIN companies c ON c.id = r.company_id
               WHERE r.company_id = ? ORDER BY r.created_at DESC""",
            (company["id"],),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT r.*, c.name AS company_name FROM roles r
               JOIN companies c ON c.id = r.company_id
               ORDER BY r.created_at DESC"""
        ).fetchall()
    return [dict(row) for row in rows]
