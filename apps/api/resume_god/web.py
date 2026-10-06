"""FastAPI app: JSON API + OAuth login + generated-file serving.

The React SPA (apps/web/) is the only UI; the legacy server-rendered
HTML pages were retired when the SPA shipped. This module wires the
/api routers, the /files static mount, and a JSON root pointer that
keeps container healthchecks happy.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles


def create_app(*, profile_path: str | Path, outputs_dir: str | Path) -> FastAPI:
    outputs_dir = Path(outputs_dir)
    app = FastAPI(title="resume-god")
    outputs_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/files", StaticFiles(directory=str(outputs_dir)), name="files")

    from .api import jobs as api_jobs
    from .api import tracker as api_tracker

    api_jobs.PROFILE_PATH = Path(profile_path)
    api_jobs.OUTPUTS_DIR = Path(outputs_dir)
    app.include_router(api_jobs.router)
    app.include_router(api_tracker.router)

    from .api.auth import build_oauth, router as auth_router
    from .api.auth import SessionMiddleware as _SessionMiddleware
    from .api.auth import session_secret as _session_secret

    app.state.oauth = build_oauth()
    app.add_middleware(_SessionMiddleware, secret_key=_session_secret())
    app.include_router(auth_router)

    @app.get("/", include_in_schema=False)
    def root() -> JSONResponse:
        return JSONResponse(
            {
                "name": "resume-god",
                "ui": "React SPA (prod: nginx :8080, dev: vite :5173)",
                "api": "/api",
                "health": "/api/health",
            }
        )

    return app
