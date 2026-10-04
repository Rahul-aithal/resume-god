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
            db_path=Path(directory) / "test.db",
            profile_path=PROFILE_PATH,
            outputs_dir=Path(directory) / "outputs",
        )
    )


class WebHardeningTests(unittest.TestCase):
    def test_dashboard_and_company_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            self.assertEqual(client.get("/").status_code, 200)
            response = client.post(
                "/companies/add",
                data={"name": "Acme", "website": "", "location": "", "about": ""},
            )
            self.assertIn(response.status_code, (200, 303))
            page = client.get("/companies/Acme")
            self.assertEqual(page.status_code, 200)
            self.assertIn("Acme", page.text)

    def test_tailor_validates_input_and_audit_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            bad = client.post(
                "/tailor",
                data={"company": "", "target_title": "", "jd_text": ""},
            )
            self.assertEqual(bad.status_code, 400)
            bad_number = client.post(
                "/tailor",
                data={
                    "company": "Acme",
                    "target_title": "Engineer",
                    "jd_text": "Python role",
                    "max_achievements": "not-a-number",
                },
            )
            self.assertEqual(bad_number.status_code, 400)

    def test_tailor_writes_unique_dirs_and_records_role(self):
        with tempfile.TemporaryDirectory() as directory:
            client = make_client(directory)
            jd = "We need Python and FastAPI engineers. " * 10
            first = client.post(
                "/tailor",
                data={
                    "company": "Acme",
                    "target_title": "Engineer",
                    "jd_text": jd,
                    "provider": "deterministic",
                    "max_achievements": "5",
                },
            )
            self.assertEqual(first.status_code, 200)
            second = client.post(
                "/tailor",
                data={
                    "company": "Acme",
                    "target_title": "Engineer",
                    "jd_text": jd + "Extra sentence about Docker. ",
                    "provider": "deterministic",
                    "max_achievements": "5",
                },
            )
            self.assertEqual(second.status_code, 200)
            out_dirs = sorted(
                path.name
                for path in (Path(directory) / "outputs").iterdir()
                if path.is_dir()
            )
            self.assertEqual(len(out_dirs), 2)
            roles = client.get("/roles")
            self.assertEqual(roles.status_code, 200)
            self.assertIn("Acme", roles.text)


if __name__ == "__main__":
    unittest.main()
