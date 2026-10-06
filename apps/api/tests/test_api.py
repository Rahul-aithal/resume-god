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


USER_A = {"id": 1, "email": "a@example.com", "display_name": "A"}
USER_B = {"id": 2, "email": "b@example.com", "display_name": "B"}


class TrackerApiTests(unittest.TestCase):
    def setUp(self):
        import os
        from unittest import mock

        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        db_url = f"sqlite:///{Path(self.directory.name) / 'tracker.db'}"
        env = mock.patch.dict(os.environ, {"DATABASE_URL": db_url})
        env.start()
        self.addCleanup(env.stop)
        from resume_god.cli import _db_migrate_main

        _db_migrate_main(["migrate", "--url", db_url])

    def make_client(self, user: dict) -> TestClient:
        app = create_app(
            profile_path=PROFILE_PATH,
            outputs_dir=Path(self.directory.name) / "outputs",
        )
        app.dependency_overrides[require_user] = lambda: dict(user)
        return TestClient(app)

    def test_requires_login(self):
        app = create_app(
            profile_path=PROFILE_PATH,
            outputs_dir=Path(self.directory.name) / "outputs",
        )
        open_client = TestClient(app)
        for path in (
            "/api/companies",
            "/api/roles",
            "/api/dashboard",
            "/api/settings",
        ):
            self.assertEqual(open_client.get(path).status_code, 401, path)

    def test_company_role_history_and_dashboard(self):
        client = self.make_client(USER_A)
        created = client.post(
            "/api/companies",
            json={"name": "Goodspace", "location": "Noida", "about": "AI hiring"},
        )
        self.assertEqual(created.status_code, 200, created.text)
        company_id = created.json()["id"]
        # Upsert updates the same row.
        again = client.post(
            "/api/companies", json={"name": "Goodspace", "location": "Remote"}
        )
        self.assertEqual(again.json()["id"], company_id)

        role = client.post(
            "/api/roles",
            json={"company_id": company_id, "target_title": "Software Engineer"},
        )
        self.assertEqual(role.status_code, 200, role.text)
        role_id = role.json()["id"]
        self.assertEqual(role.json()["status"], "applied")

        duplicate = client.post(
            "/api/roles",
            json={"company_id": company_id, "target_title": "Software Engineer"},
        )
        self.assertEqual(duplicate.status_code, 409)

        updated = client.patch(f"/api/roles/{role_id}", json={"status": "interview"})
        self.assertEqual(updated.json()["status"], "interview")
        bad_status = client.patch(f"/api/roles/{role_id}", json={"status": "hired"})
        self.assertEqual(bad_status.status_code, 400)

        history = client.get(f"/api/roles/{role_id}/history").json()
        self.assertEqual(
            [row["status"] for row in history["history"]], ["applied", "interview"]
        )

        dashboard = client.get("/api/dashboard").json()
        self.assertEqual(dashboard["company_count"], 1)
        self.assertEqual(dashboard["role_count"], 1)
        self.assertEqual(dashboard["by_status"], {"interview": 1})

        detail = client.get(f"/api/companies/{company_id}").json()
        self.assertEqual(detail["role_count"], 1)
        self.assertEqual(detail["by_status"], {"interview": 1})
        self.assertEqual(detail["roles"][0]["company_name"], "Goodspace")

    def test_users_cannot_see_each_others_data(self):
        client_a = self.make_client(USER_A)
        client_b = self.make_client(USER_B)
        company = client_a.post("/api/companies", json={"name": "SecretCo"})
        company_id = company.json()["id"]
        role = client_a.post(
            "/api/roles",
            json={"company_id": company_id, "target_title": "Engineer"},
        )
        role_id = role.json()["id"]

        self.assertEqual(client_b.get("/api/companies").json()["companies"], [])
        self.assertEqual(client_b.get(f"/api/companies/{company_id}").status_code, 404)
        self.assertEqual(client_b.get(f"/api/roles/{role_id}/history").status_code, 404)
        self.assertEqual(client_b.get("/api/dashboard").json()["role_count"], 0)
        # B cannot patch A's role.
        self.assertEqual(
            client_b.patch(f"/api/roles/{role_id}", json={"status": "offer"}).status_code,
            404,
        )

    def test_tailor_with_company_links_role(self):
        client = self.make_client(USER_A)
        tailor = client.post(
            "/api/tailor",
            json={
                "jd_text": "We need Python and FastAPI engineers. " * 5,
                "target_title": "Engineer",
                "provider": "deterministic",
                "company_name": "LinkedCo",
            },
        )
        self.assertEqual(tailor.status_code, 200, tailor.text)
        role_id = tailor.json()["role_id"]
        self.assertIsNotNone(role_id)
        companies = client.get("/api/companies").json()["companies"]
        self.assertEqual([row["name"] for row in companies], ["LinkedCo"])
        dashboard = client.get("/api/dashboard").json()
        self.assertEqual(dashboard["role_count"], 1)
        # Existing role with same title is reused, history appended.
        second = client.post(
            "/api/tailor",
            json={
                "jd_text": "Python and FastAPI again. " * 5,
                "target_title": "Engineer",
                "provider": "deterministic",
                "company_name": "LinkedCo",
            },
        )
        self.assertEqual(second.json()["role_id"], role_id)
        history = client.get(f"/api/roles/{role_id}/history").json()
        self.assertEqual(len(history["history"]), 2)

    def test_tailor_unknown_company_is_404(self):
        client = self.make_client(USER_A)
        response = client.post(
            "/api/tailor",
            json={
                "jd_text": "Python role. " * 5,
                "target_title": "Engineer",
                "provider": "deterministic",
                "company_id": 999,
            },
        )
        self.assertEqual(response.status_code, 404)

    def test_settings_roundtrip_and_providers_merge(self):
        client = self.make_client(USER_A)
        original = client.get("/api/settings").json()
        self.assertEqual(original["llm_order"], "gemini,glm")

        saved = client.put(
            "/api/settings",
            json={"llm_order": "glm,gemini", "default_font": "Helvetica"},
        )
        self.assertEqual(saved.status_code, 200, saved.text)
        self.assertEqual(saved.json()["llm_order"], "glm,gemini")
        self.assertEqual(saved.json()["default_font"], "Helvetica")

        providers = client.get("/api/providers").json()
        self.assertEqual(providers["order"], ["glm", "gemini"])
        self.assertEqual(providers["default_font"], "Helvetica")

        bad = client.put("/api/settings", json={"llm_order": "gpt4,glm"})
        self.assertEqual(bad.status_code, 400)
        empty = client.put("/api/settings", json={"llm_order": ",,"})
        self.assertEqual(empty.status_code, 400)

        # Settings are per-user: B still sees defaults.
        client_b = self.make_client(USER_B)
        self.assertEqual(client_b.get("/api/settings").json()["llm_order"], "gemini,glm")


if __name__ == "__main__":
    unittest.main()
