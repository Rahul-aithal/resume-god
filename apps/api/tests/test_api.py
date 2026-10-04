import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from resume_god.api.auth import require_user
from resume_god.web import create_app


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"

FAKE_USER = {"id": 1, "email": "tester@example.com", "display_name": "Tester"}


def make_client(directory: str) -> TestClient:
    app = create_app(
        db_path=Path(directory) / "test.db",
        profile_path=PROFILE_PATH,
        outputs_dir=Path(directory) / "outputs",
    )
    app.dependency_overrides[require_user] = lambda: dict(FAKE_USER)
    return TestClient(app)


class JsonApiTests(unittest.TestCase):
    def test_health_and_providers(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            self.assertEqual(client.get("/api/health").json(), {"status": "ok"})
            providers = client.get("/api/providers").json()
            self.assertIn("auto", providers["auto"])
            self.assertIn("gemini", providers["models"])

    def test_tailor_requires_login(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(
                db_path=Path(directory) / "test.db",
                profile_path=PROFILE_PATH,
                outputs_dir=Path(directory) / "outputs",
            )
            open_client = TestClient(app)
            response = open_client.post("/api/tailor", json={"jd_text": "x"})
            self.assertEqual(response.status_code, 401)

    def test_tailor_review_render_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            tailor = client.post(
                "/api/tailor",
                json={
                    "jd_text": "We need Python and FastAPI engineers. " * 10,
                    "target_title": "Engineer",
                    "provider": "deterministic",
                    "max_achievements": 5,
                },
            )
            self.assertEqual(tailor.status_code, 200, tailor.text)
            body = tailor.json()
            self.assertIn("plan", body)
            self.assertIn("skill_diff", body)
            self.assertEqual(body["providers"]["selection"]["used"], "deterministic")

            plan = body["plan"]
            first_id = next(iter(plan["rewrites"]))
            review = client.post(
                "/api/review",
                json={
                    "plan": plan,
                    "edits": {"rewritten_text": {first_id: "Python work."}},
                },
            )
            self.assertEqual(review.status_code, 200, review.text)
            reviewed = review.json()
            self.assertIn("resume_data", reviewed)
            self.assertEqual(reviewed["resume_data"]["version"], 1)

            bad = client.post(
                "/api/review",
                json={
                    "plan": plan,
                    "edits": {"rewritten_text": {"ghost-id": "Hi."}},
                },
            )
            self.assertEqual(bad.status_code, 400)

            render = client.post("/api/render", json={"plan": plan})
            self.assertEqual(render.status_code, 200, render.text[:200])
            self.assertTrue(render.content.startswith(b"%PDF"))
            self.assertEqual(render.headers["content-type"], "application/pdf")

    def test_tailor_rejects_empty_jd(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            response = client.post("/api/tailor", json={"jd_text": ""})
            self.assertEqual(response.status_code, 422)

    def test_profiles_import_and_list(self):
        with tempfile.TemporaryDirectory() as directory:
            import os
            from unittest import mock

            db_url = f"sqlite:///{Path(directory) / 'api.db'}"
            with mock.patch.dict(os.environ, {"DATABASE_URL": db_url}):
                from resume_god.cli import _db_migrate_main

                _db_migrate_main(["migrate", "--url", db_url])
                client = make_client(directory)
                imported = client.post(
                    "/api/profiles/import",
                    json={
                        "profile_yaml": (PROFILE_PATH).read_text(encoding="utf-8"),
                    },
                )
                self.assertEqual(imported.status_code, 200, imported.text)
                self.assertEqual(imported.json()["version"], 1)
                listed = client.get("/api/profiles").json()
                self.assertTrue(listed["has_active"])
                self.assertEqual(listed["active_status"], "user_reviewed")
                bad = client.post(
                    "/api/profiles/import", json={"profile_yaml": "status: draft"}
                )
                self.assertEqual(bad.status_code, 400)


if __name__ == "__main__":
    unittest.main()
