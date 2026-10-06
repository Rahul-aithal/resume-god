import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from resume_god.web import create_app


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


def make_client(directory: str) -> TestClient:
    return TestClient(
        create_app(
            profile_path=PROFILE_PATH,
            outputs_dir=Path(directory) / "outputs",
        )
    )


class LegacyUiRetiredTests(unittest.TestCase):
    """The React SPA is the only UI; server-rendered pages are gone."""

    def test_root_is_a_json_pointer(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            response = client.get("/")
            self.assertEqual(response.status_code, 200)
            body = response.json()
            self.assertEqual(body["name"], "resume-god")
            self.assertIn("/api", body["api"])

    def test_legacy_html_routes_are_gone(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            for path in ("/companies", "/companies/Acme", "/roles", "/new"):
                self.assertEqual(client.get(path).status_code, 404, path)
            for path in ("/companies/add", "/tailor"):
                self.assertEqual(client.post(path, data={}).status_code, 404, path)

    def test_api_and_files_still_served(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            self.assertEqual(client.get("/api/health").json(), {"status": "ok"})
            # Data endpoints stay login-gated even without a session.
            self.assertEqual(client.get("/api/providers").status_code, 401)
            (Path(directory) / "outputs" / "hello.txt").write_text("hi")
            served = client.get("/files/hello.txt")
            self.assertEqual(served.status_code, 200)
            self.assertEqual(served.text, "hi")

    def test_openapi_documents_only_json_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            paths = client.get("/openapi.json").json()["paths"]
            self.assertIn("/api/tailor", paths)
            self.assertIn("/api/companies", paths)
            self.assertIn("/api/auth/login/{provider}", paths)
            self.assertNotIn("/tailor", paths)
            self.assertNotIn("/companies/add", paths)


if __name__ == "__main__":
    unittest.main()
