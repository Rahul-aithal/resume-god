"""JSON API package (M1). Routers mount under /api in web.create_app."""

from .jobs import router

__all__ = ["router"]
