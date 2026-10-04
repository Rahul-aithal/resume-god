"""JSON API package (M1). Routers mount under /api in web.create_app."""

from . import auth
from .jobs import router

__all__ = ["auth", "router"]
