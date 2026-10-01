import re
import subprocess
import unittest
from pathlib import Path

import yaml


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


def load_profile():
    with PROFILE_PATH.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def normalize_text(value):
    value = value.replace("\u00a0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def extract_pdf_text(path):
    result = subprocess.run(
        ["pdftotext", "-layout", str(path), "-"],
        check=True,
        capture_output=True,
        text=True,
    )
    return normalize_text(result.stdout)


class MasterProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile()
        cls.sources = {
            source["id"]: source
            for source in cls.profile["sources"]
        }
        pdf_sources = {
            source_id: source
            for source_id, source in cls.sources.items()
            if source.get("format") == "pdf"
        }
        cls.source_text = {
            source_id: extract_pdf_text(ROOT / source["path"])
            for source_id, source in pdf_sources.items()
        }

    def test_user_review_status_and_conflicts_are_resolved(self):
        self.assertEqual(self.profile["status"], "user_reviewed")
        self.assertEqual(self.profile["version"], 1)
        self.assertEqual(self.profile["pending_conflicts"], [])
        self.assertEqual(self.profile["review_gaps"], [])
        self.assertEqual(self.profile["metadata"]["review_completed_on"], "2026-09-25")

    def test_source_files_exist(self):
        for source in self.profile["sources"]:
            self.assertIn("id", source)
            self.assertIn("resume_version", source)
            self.assertTrue((ROOT / source["path"]).is_file())

    def test_contact_information_and_hyperlinks_are_preserved(self):
        contact = self.profile["contact"]
        self.assertEqual(contact["name"], "Rahul Aithal")
        self.assertEqual(contact["location"], "Bengaluru, KA")
        self.assertEqual(contact["phone"], "+91-9449332162")
        self.assertEqual(contact["email"], "aithalrahul34@gmail.com")

        expected_links = {
            "LinkedIn": "https://linkedin.com/in/rahul-aithal",
            "GitHub": "https://github.com/Rahul-aithal",
            "Portfolio": "https://rahulaithal.site/",
        }
        actual_links = {link["label"]: link["url"] for link in contact["links"]}
        self.assertEqual(actual_links, expected_links)

        for source_id, text in self.source_text.items():
            with self.subTest(source=source_id):
                self.assertIn("LinkedIn", text)
                self.assertIn("GitHub", text)
                self.assertIn("Portfolio", text)

    def test_all_node_ids_are_unique(self):
        sections = [
            "sources",
            "skills",
            "experiences",
            "projects",
            "achievements",
            "education",
            "certifications",
            "soft_skills",
        ]
        ids = []
        for section in sections:
            for node in self.profile[section]:
                self.assertIn("id", node, f"{section} node lacks id")
                ids.append(node["id"])

        duplicates = {node_id for node_id in ids if ids.count(node_id) > 1}
        self.assertEqual(duplicates, set())

    def test_skill_names_and_aliases_are_canonical_and_unique(self):
        canonical = {}
        for skill in self.profile["skills"]:
            self.assertTrue(skill["name"])
            self.assertTrue(skill["category"])
            names = [skill["name"], *skill.get("aliases", [])]
            for name in names:
                normalized = normalize_text(name).casefold()
                self.assertNotIn(normalized, canonical)
                canonical[normalized] = skill["id"]

    def test_achievement_structure_and_graph_references(self):
        skill_ids = {skill["id"] for skill in self.profile["skills"]}
        parent_ids = {
            node["id"]
            for section in ("experiences", "projects")
            for node in self.profile[section]
        }

        for achievement in self.profile["achievements"]:
            achievement_id = achievement["id"]
            with self.subTest(achievement=achievement_id):
                self.assertTrue(achievement["text"].strip())
                self.assertIn(achievement["part_of"], parent_ids)
                self.assertIsInstance(achievement["metrics"], list)
                self.assertIsInstance(achievement["source"], list)
                self.assertTrue(achievement["source"])
                self.assertTrue(achievement["source_excerpts"])
                self.assertTrue(set(achievement["skills"]).issubset(skill_ids))

    def test_achievement_dates_match_their_parent_nodes(self):
        parents = {
            node["id"]: node.get("date_range")
            for section in ("experiences", "projects")
            for node in self.profile[section]
        }
        for achievement in self.profile["achievements"]:
            with self.subTest(achievement=achievement["id"]):
                self.assertEqual(achievement["date_range"], parents[achievement["part_of"]])

    def test_date_ranges_use_supported_precision(self):
        nodes = []
        for section in ("experiences", "projects", "achievements", "education", "certifications"):
            nodes.extend(self.profile[section])

        month = re.compile(r"^\d{4}-\d{2}$")
        year = re.compile(r"^\d{4}$")
        for node in nodes:
            date_range = node.get("date_range")
            if date_range is None:
                continue
            with self.subTest(node=node["id"]):
                self.assertIn(date_range["precision"], {"month", "year"})
                pattern = month if date_range["precision"] == "month" else year
                if date_range["start"] is not None:
                    self.assertRegex(date_range["start"], pattern)
                if date_range["end"] is not None:
                    self.assertRegex(date_range["end"], pattern)
                    if date_range["start"] is not None:
                        self.assertLessEqual(date_range["start"], date_range["end"])
                if not date_range.get("expected"):
                        self.assertEqual(date_range["end"] is None, bool(date_range.get("ongoing")))

    def test_user_reviewed_date_facts_are_applied(self):
        hashvault = next(
            item
            for item in self.profile["experiences"]
            if item["id"] == "experience_hashvault_tech_lead"
        )
        self.assertTrue(hashvault["date_range"]["ongoing"])
        self.assertEqual(hashvault["date_range"]["start"], "2024-10")
        self.assertIn("user_review_2026_10_01", hashvault["source"])

        mongodb = self.profile["certifications"][0]
        self.assertEqual(mongodb["issued_on"], "2025-03-03")
        self.assertEqual(mongodb["date_range"]["start"], "2025-03")

        lms = next(
            item
            for item in self.profile["projects"]
            if item["id"] == "project_learning_management_system"
        )
        self.assertIsNone(lms["date_range"])

    def test_rejected_vaultr_release_count_is_not_present(self):
        achievement_text = " ".join(
            achievement["text"] for achievement in self.profile["achievements"]
        )
        self.assertNotIn("8 versioned", achievement_text)

    def test_corrected_internship_work_modes_are_applied(self):
        ownership = next(
            item
            for item in self.profile["soft_skills"]
            if item["id"] == "soft_ownership_driven"
        )
        collaboration = next(
            item
            for item in self.profile["soft_skills"]
            if item["id"] == "soft_collaborative"
        )
        self.assertIn("solo at Pragya Cyber Ltd", ownership["text"])
        self.assertNotIn("across internships", ownership["text"])
        self.assertIn("works collaboratively with the team at XParth", collaboration["text"])

    def test_every_source_excerpt_is_verbatim_in_its_source_pdf(self):
        for achievement in self.profile["achievements"]:
            for excerpt in achievement["source_excerpts"]:
                with self.subTest(achievement=achievement["id"], source=excerpt["source"]):
                    self.assertIn(excerpt["source"], self.sources)
                    normalized = normalize_text(excerpt["text"])
                    self.assertIn(normalized, self.source_text[excerpt["source"]])

    def test_all_source_references_resolve(self):
        sections = [
            "source_summaries",
            "experiences",
            "projects",
            "achievements",
            "education",
            "certifications",
            "soft_skills",
        ]
        for section in sections:
            for node in self.profile[section]:
                source_field = node.get("variants", node.get("source"))
                if source_field is None:
                    source_field = []
                if isinstance(source_field, str):
                    source_field = [{"source": source_field}]
                for variant in source_field:
                    source_id = variant["source"] if isinstance(variant, dict) else variant
                    self.assertIn(source_id, self.sources)

    def test_conflict_report_lists_every_resolved_conflict(self):
        report = (ROOT / "PHASE_0_REVIEW.md").read_text(encoding="utf-8")
        for conflict_id in self.profile["resolved_conflicts"]:
            with self.subTest(conflict=conflict_id):
                self.assertIn(f"### {conflict_id}", report)


if __name__ == "__main__":
    unittest.main()
