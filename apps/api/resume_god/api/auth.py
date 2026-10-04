"""OAuth login (B3): Google via Authlib, cookie sessions.

Unconfigured providers return 503 with setup instructions instead of
crashing. Sessions are signed cookies (SESSION_SECRET); without one, an
ephemeral per-boot secret is used and a warning is logged — safe, but
logins don't survive restarts.
"""

from __future__ import annotations

import logging
import os
import secrets
from typing import Any

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")

PROVIDERS = ("google",)
# NOTE: GitHub support was removed for now. Restore from git history
# (feat commit 47dcd19) to re-add: PROVIDERS entry, oauth.register block
# below, and the fetch_userinfo branch.


def session_secret() -> str:
    configured = os.environ.get("SESSION_SECRET")
    if configured:
        return configured
    logger.warning(
        "SESSION_SECRET is not set; using an ephemeral session secret. "
        "Set SESSION_SECRET to keep logins across restarts."
    )
    return secrets.token_hex(32)


def build_oauth() -> OAuth:
    oauth = OAuth()
    if os.environ.get("GOOGLE_CLIENT_ID") and os.environ.get("GOOGLE_CLIENT_SECRET"):
        oauth.register(
            name="google",
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
            # Explicit endpoints (no OIDC discovery fetch at redirect time).
            authorize_url="https://accounts.google.com/o/oauth2/v2/auth",
            access_token_url="https://oauth2.googleapis.com/token",
            jwks_uri="https://www.googleapis.com/oauth2/v3/certs",
            client_kwargs={"scope": "openid email profile"},
        )
    if os.environ.get("GITHUB_CLIENT_ID") or os.environ.get("GITHUB_CLIENT_SECRET"):
        logger.warning(
            "GitHub OAuth was removed; ignoring GITHUB_CLIENT_ID/SECRET."
        )
    return oauth


def _get_oauth(request: Request) -> OAuth:
    oauth = request.app.state.oauth
    return oauth


def _client(request: Request, provider: str):
    if provider not in PROVIDERS:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    oauth = _get_oauth(request)
    try:
        return getattr(oauth, provider)
    except AttributeError:
        raise HTTPException(
            status_code=503,
            detail=(
                f"{provider} OAuth is not configured. Set "
                f"{provider.upper()}_CLIENT_ID and {provider.upper()}_CLIENT_SECRET."
            ),
        )


async def fetch_userinfo(provider: str, client, token: dict[str, Any]) -> dict[str, Any]:
    """Normalize provider userinfo to {subject, email, name}."""
    if provider != "google":
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")
    resp = await client.get(
        "https://openidconnect.googleapis.com/v1/userinfo", token=token
    )
    data = resp.json()
    if not data.get("sub") or not data.get("email"):
        raise HTTPException(status_code=502, detail="Google userinfo incomplete")
    return {
        "subject": f"google:{data['sub']}",
        "email": str(data["email"]),
        "name": str(data.get("name") or data["email"]),
    }


def get_current_user(request: Request) -> dict[str, Any] | None:
    """Return the session user (None when logged out). B4 enforces this."""
    user_id = request.session.get("user_id")
    if not user_id:
        return None
    from ..db import make_session_factory
    from ..db import User

    with make_session_factory()() as session:
        user = session.get(User, user_id)
        if user is None:
            return None
        return {"id": user.id, "email": user.email, "display_name": user.display_name}


def require_user(request: Request) -> dict[str, Any]:
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Login required")
    return user


@router.get("/login/{provider}")
async def login(request: Request, provider: str):
    client = _client(request, provider)
    redirect_uri = str(request.url_for("auth_callback", provider=provider))
    return await client.authorize_redirect(request, redirect_uri)


@router.get("/callback/{provider}", name="auth_callback")
async def auth_callback(request: Request, provider: str):
    from ..db import User, make_session_factory

    client = _client(request, provider)
    token = await client.authorize_access_token(request)
    info = await fetch_userinfo(provider, client, token)
    with make_session_factory()() as session:
        user = session.query(User).filter_by(oauth_subject=info["subject"]).one_or_none()
        if user is None:
            existing = session.query(User).filter_by(email=info["email"]).one_or_none()
            if existing is not None and existing.oauth_subject is None:
                existing.oauth_subject = info["subject"]
                existing.display_name = existing.display_name or info["name"]
                user = existing
            else:
                user = User(
                    email=info["email"],
                    display_name=info["name"],
                    oauth_subject=info["subject"],
                )
                session.add(user)
            session.commit()
        request.session["user_id"] = user.id
    return RedirectResponse("/", status_code=303)


@router.post("/logout")
async def logout(request: Request):
    request.session.clear()
    return {"status": "logged out"}


@router.get("/me")
async def me(request: Request):
    user = get_current_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Not logged in")
    return user


__all__ = [
    "router",
    "build_oauth",
    "session_secret",
    "get_current_user",
    "require_user",
    "fetch_userinfo",
    "SessionMiddleware",
]
