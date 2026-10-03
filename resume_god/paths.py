"""Default file resolution for local and globally installed CLI use."""

from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def default_profile_path() -> Path:
    """Resolve the reviewed profile without requiring a cd into the repo."""
    configured = os.environ.get("RESUME_GOD_PROFILE")
    if configured:
        path = Path(configured).expanduser()
        return path if path.is_absolute() else Path.cwd() / path

    local = Path.cwd() / "master_profile.yaml"
    if local.is_file():
        return local
    return PROJECT_ROOT / "master_profile.yaml"


def default_manifest_path() -> Path:
    """Resolve the application manifest from the environment or checkout."""
    configured = os.environ.get("RESUME_GOD_MANIFEST")
    if configured:
        path = Path(configured).expanduser()
        return path if path.is_absolute() else Path.cwd() / path

    local = Path.cwd() / "applications.yaml"
    if local.is_file():
        return local
    return PROJECT_ROOT / "applications.yaml"
