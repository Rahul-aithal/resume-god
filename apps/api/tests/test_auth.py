import tempfile
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from resume_god.web import create_app


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


def make_client(directory: str) -> TestClient:
    return TestClient(
        create_app(
            db_path=Path(directory) / "test.db",
            profile_path=PROFILE_PATH,
            outputs_dir=Path(directory) / "outputs",
        )
    )


class AuthTests(unittest.TestCase):
    def test_me_requires_login_and_logout_clears(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            self.assertEqual(client.get("/api/auth/me").status_code, 401)
            # Simulate a logged-in session by priming the cookie jar.
            with mock.patch(
                "resume_god.api.auth.get_current_user",
                return_value={"id": 1, "email": "a@b.c", "display_name": "A"},
            ):
                me = client.get("/api/auth/me")
                self.assertEqual(me.status_code, 200)
                self.assertEqual(me.json()["email"], "a@b.c")
            logged_out = client.post("/api/auth/logout")
            self.assertEqual(logged_out.json(), {"status": "logged out"})
            self.assertEqual(client.get("/api/auth/me").status_code, 401)

    def test_unconfigured_provider_login_is_503(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            for provider in ("google", "github"):
                response = client.get(f"/api/auth/login/{provider}")
                self.assertEqual(response.status_code, 503)
                self.assertIn("not configured", response.json()["detail"])
            missing = client.get("/api/auth/login/bitbucket")
            self.assertEqual(missing.status_code, 404)

    def test_callback_creates_user_and_session(self):
        import os

        with tempfile.TemporaryDirectory() as directory:
            db_url = f"sqlite:///{Path(directory) / 'auth.db'}"
            with mock.patch.dict(os.environ, {"DATABASE_URL": db_url}):
                from resume_god.cli import _db_migrate_main

                _db_migrate_main(["migrate", "--url", db_url])
                client = make_client(directory)

                async def fake_token(request):
                    return {"access_token": "x"}

                async def fake_userinfo(provider, client, token):
                    return {
                        "subject": "google:123",
                        "email": "user@example.com",
                        "name": "Test User",
                    }

                fake_client = mock.MagicMock()
                fake_client.authorize_access_token.side_effect = fake_token
                with mock.patch.object(
                    client.app.state.oauth, "google", fake_client, create=True
                ), mock.patch(
                    "resume_god.api.auth.fetch_userinfo", side_effect=fake_userinfo
                ):
                    response = client.get(
                        "/api/auth/callback/google?code=abc&state=xyz",
                        follow_redirects=False,
                    )
                self.assertIn(response.status_code, (303, 307))
                me = client.get("/api/auth/me")
                self.assertEqual(me.status_code, 200)
                self.assertEqual(me.json()["email"], "user@example.com")
                # Second login links to the same user, no duplicate.
                with mock.patch.object(
                    client.app.state.oauth, "google", fake_client, create=True
                ), mock.patch(
                    "resume_god.api.auth.fetch_userinfo", side_effect=fake_userinfo
                ):
                    client.get(
                        "/api/auth/callback/google?code=abc&state=xyz",
                        follow_redirects=False,
                    )
                from resume_god.db import make_session_factory
                from resume_god.db import User

                with make_session_factory()() as session:
                    count = (
                        session.query(User)
                        .filter_by(email="user@example.com")
                        .count()
                    )
                self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
