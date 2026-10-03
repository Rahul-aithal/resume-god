import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from resume_god.jd_parser import parse_job_description
from resume_god.llm import LLMError, _extract_json, make_provider
from resume_god.tailor import load_profile


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


class FakeProvider:
    name = "fake"

    def __init__(self, payload):
        self.payload = payload
        self.prompt = None

    def complete_json(self, prompt):
        self.prompt = prompt
        return self.payload


class JDParserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)

    def read_jd(self, number):
        return (ROOT / "fixtures" / "jds" / f"jd-{number}.txt").read_text(
            encoding="utf-8"
        )

    def test_fixture_jds_parse_into_clean_json(self):
        expected_roles = {
            1: "Software Developer",
            2: "Full Stack Developers",
            3: "Software Engineer I",
            4: "Product Engineer",
        }
        for number, role in expected_roles.items():
            with self.subTest(jd=number):
                parsed = parse_job_description(
                    self.profile, self.read_jd(number)
                )
                self.assertEqual(parsed["version"], 1)
                self.assertEqual(parsed["provider"], "deterministic")
                self.assertEqual(parsed["role_title"], role)
                self.assertTrue(parsed["must_have_skills"] or parsed["nice_to_have_skills"])
                self.assertTrue(parsed["key_responsibilities"])
                self.assertTrue(
                    all(
                        set(skill) == {"id", "name", "matched_term"}
                        for skill in parsed["must_have_skills"] + parsed["nice_to_have_skills"]
                    )
                )

    def test_known_aliases_normalize_to_canonical_skills(self):
        parsed = parse_job_description(self.profile, self.read_jd(1))
        names = {
            row["name"]
            for row in parsed["must_have_skills"] + parsed["nice_to_have_skills"]
        }
        self.assertIn("Node.js", names)
        self.assertIn("React.js", names)
        self.assertIn("Express.js", names)
        self.assertIn("JavaScript", names)

    def test_unknown_skills_are_kept_and_reported(self):
        parsed = parse_job_description(self.profile, self.read_jd(1))
        unknown = {row["name"] for row in parsed["unknown_skills"]}
        self.assertIn("MySQL", unknown)
        # RESTful APIs is now a reviewed alias of REST APIs, so it
        # normalizes to a known skill instead of staying unknown.
        known = {
            row["name"]
            for row in parsed["must_have_skills"] + parsed["nice_to_have_skills"]
        }
        self.assertIn("REST APIs", known)

        explicit = parse_job_description(
            self.profile,
            "Required: Java, JavaScript, MySQL. Nice to have: Kubernetes.",
            target_title="Software Engineer",
        )
        explicit_unknown = {
            row["name"] for row in explicit["unknown_skills"]
        }
        self.assertIn("Java", explicit_unknown)
        self.assertIn("Kubernetes", explicit_unknown)

    def test_provider_output_is_normalized_and_unknowns_survive(self):
        provider = FakeProvider(
            {
                "role_title": "Backend Engineer",
                "seniority": "junior",
                "must_have_skills": ["Node", "Postgres", "Kubernetes"],
                "nice_to_have_skills": ["React"],
                "keywords": ["APIs", "Kubernetes"],
                "key_responsibilities": ["Build APIs"],
            }
        )
        parsed = parse_job_description(
            self.profile,
            "Use Node, Postgres, React, and Kubernetes.",
            provider=provider,
            target_title="Backend Engineer",
        )
        self.assertEqual(parsed["provider"], "fake")
        self.assertEqual(
            [row["name"] for row in parsed["must_have_skills"]],
            ["Node.js", "PostgreSQL"],
        )
        self.assertEqual(
            [row["name"] for row in parsed["nice_to_have_skills"]], ["React.js"]
        )
        self.assertEqual(
            [row["name"] for row in parsed["unknown_skills"]], ["Kubernetes"]
        )
        self.assertIn("alias table", provider.prompt)
        self.assertIn("Kubernetes", provider.prompt)

    def test_json_extractor_rejects_non_object_and_provider_names_validate(self):
        with self.assertRaises(LLMError):
            _extract_json("[]")
        with self.assertRaises(ValueError):
            make_provider("unsupported")

    def test_cli_writes_normalized_json(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "parsed.json"
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "resume_god.jd_parser",
                    str(ROOT / "fixtures" / "jds" / "jd-1.txt"),
                    "--profile",
                    str(PROFILE_PATH),
                    "--json-output",
                    str(output),
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )
            self.assertEqual(completed.stdout, "")
            parsed = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(parsed["role_title"], "Software Developer")


if __name__ == "__main__":
    unittest.main()
