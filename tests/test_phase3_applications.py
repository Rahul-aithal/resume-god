import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import yaml

from resume_god.applications import (
    build_application_packets,
    load_application_manifest,
)
from resume_god.tailor import load_profile


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"

AUTOMATION_JD = """
AI Automation Engineer

Build reliable LLM-powered workflows and agent tooling. The role uses Python,
n8n, LLM API integration, Prompt Engineering, Model Context Protocol, OAuth2,
PostgreSQL, and Docker.
"""

SOFTWARE_JD = """
Software Developer

Build web applications with JavaScript, Node.js, React.js, Express.js, RESTful
APIs, MySQL, and GitHub.
"""


def write_manifest(
    root: Path,
    *,
    applications: list[dict],
    defaults: dict | None = None,
) -> Path:
    manifest = {
        "version": 1,
        "defaults": defaults or {"max_achievements": 4},
        "applications": applications,
    }
    path = root / "applications.yaml"
    path.write_text(yaml.safe_dump(manifest, sort_keys=False), encoding="utf-8")
    return path


class ApplicationPacketTests(unittest.TestCase):
    def setUp(self):
        self.profile = load_profile(PROFILE_PATH)
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

        (self.root / "automation.txt").write_text(AUTOMATION_JD, encoding="utf-8")
        (self.root / "software.txt").write_text(SOFTWARE_JD, encoding="utf-8")

    def test_manifest_validates_ids_defaults_and_relative_paths(self):
        manifest_path = write_manifest(
            self.root,
            applications=[
                {
                    "id": "example-role",
                    "company": "Example Company",
                    "target_title": "AI Automation Engineer",
                    "job_description_file": "automation.txt",
                }
            ],
        )
        applications = load_application_manifest(manifest_path)

        self.assertEqual(len(applications), 1)
        self.assertEqual(applications[0]["max_achievements"], 4)
        self.assertEqual(
            applications[0]["job_description_file"],
            self.root / "automation.txt",
        )

    def test_manifest_rejects_invalid_ids_and_duplicate_applications(self):
        base = {
            "company": "Example Company",
            "target_title": "Software Engineer",
            "job_description_file": "software.txt",
        }
        cases = [
            {**base, "id": "Example Role"},
            {**base, "id": "../escape"},
            [
                {**base, "id": "example-role"},
                {**base, "id": "example-role"},
            ],
        ]
        for applications in cases:
            with self.subTest(applications=applications):
                manifest_path = write_manifest(
                    self.root, applications=applications  # type: ignore[arg-type]
                )
                with self.assertRaises(ValueError):
                    load_application_manifest(manifest_path)

    def test_manifest_rejects_boolean_version_and_unknown_keys(self):
        boolean_path = self.root / "boolean-version.yaml"
        boolean_path.write_text(
            "version: true\ndefaults: {}\napplications: []\n", encoding="utf-8"
        )
        with self.assertRaisesRegex(ValueError, "version must be 1"):
            load_application_manifest(boolean_path)

        unknown_path = self.root / "unknown-key.yaml"
        unknown_path.write_text(
            "version: 1\ndefaults: {}\napplications: []\nunknown: key\n",
            encoding="utf-8",
        )
        with self.assertRaisesRegex(ValueError, "Unknown application manifest keys"):
            load_application_manifest(unknown_path)

    def test_batch_writes_all_artifacts_and_reports_evidence_gaps(self):
        manifest_path = write_manifest(
            self.root,
            applications=[
                {
                    "id": "automation-engineer",
                    "company": "Example AI",
                    "target_title": "AI Automation Engineer",
                    "job_description_file": "automation.txt",
                },
                {
                    "id": "software-developer",
                    "company": "Example Software",
                    "target_title": "Software Developer",
                    "job_description_file": "software.txt",
                    "max_achievements": 2,
                    "summary": "Reviewed full-stack summary for Example Software.",
                },
            ],
        )
        output_dir = self.root / "generated"
        index = build_application_packets(
            self.profile,
            yaml.safe_load(manifest_path.read_text(encoding="utf-8")),
            manifest_path=manifest_path,
            output_dir=output_dir,
        )

        self.assertTrue(index["all_audits_passed"])
        self.assertEqual(index["application_count"], 2)
        for application_id in ("automation-engineer", "software-developer"):
            packet = output_dir / application_id
            expected = {
                "tailoring-plan.md",
                "tailoring-plan.json",
                "resume.md",
                "resume.html",
            }
            self.assertEqual(
                {path.name for path in packet.iterdir()}, expected
            )

        software = next(
            item
            for item in index["applications"]
            if item["id"] == "software-developer"
        )
        gap_names = {
            item["name"]
            for item in software["matched_but_unevidenced_skills"]
        }
        self.assertIn("JavaScript", gap_names)
        self.assertIn("Express.js", gap_names)
        self.assertIn("GitHub", gap_names)
        self.assertIn(
            "Reviewed full-stack summary for Example Software.",
            (output_dir / "software-developer" / "resume.md").read_text(
                encoding="utf-8"
            ),
        )

        index_markdown = (output_dir / "index.md").read_text(encoding="utf-8")
        self.assertIn("[automation-engineer](automation-engineer/resume.html)", index_markdown)
        self.assertIn("Direct-skill coverage", index_markdown)
        self.assertIn("**software-developer:**", index_markdown)

    def test_failed_later_application_does_not_write_partial_batch(self):
        manifest_path = write_manifest(
            self.root,
            applications=[
                {
                    "id": "valid-application",
                    "company": "Example AI",
                    "target_title": "AI Automation Engineer",
                    "job_description_file": "automation.txt",
                },
                {
                    "id": "missing-application",
                    "company": "Missing JD",
                    "target_title": "Software Engineer",
                    "job_description_file": "missing.txt",
                },
            ],
        )
        output_dir = self.root / "generated"

        with self.assertRaises(FileNotFoundError):
            build_application_packets(
                self.profile,
                yaml.safe_load(manifest_path.read_text(encoding="utf-8")),
                manifest_path=manifest_path,
                output_dir=output_dir,
            )

        self.assertFalse(output_dir.exists())


class ApplicationCliTests(unittest.TestCase):
    def test_cli_builds_manifest_packets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "job.txt").write_text(AUTOMATION_JD, encoding="utf-8")
            manifest_path = write_manifest(
                root,
                applications=[
                    {
                        "id": "cli-role",
                        "company": "CLI Example",
                        "target_title": "AI Automation Engineer",
                        "job_description_file": "job.txt",
                    }
                ],
            )
            output_dir = root / "output" / "applications"

            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "resume_god.applications",
                    "--profile",
                    str(PROFILE_PATH),
                    "--manifest",
                    str(manifest_path),
                    "--output-dir",
                    str(output_dir),
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )

            self.assertIn("index.md", completed.stdout)
            index = json.loads(
                (output_dir / "index.json").read_text(encoding="utf-8")
            )
            self.assertTrue(index["all_audits_passed"])
            self.assertTrue((output_dir / "cli-role" / "resume.html").exists())


if __name__ == "__main__":
    unittest.main()
