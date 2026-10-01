import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from resume_god.tailor import (
    build_tailoring_plan,
    find_matched_skills,
    load_profile,
    render_plan_markdown,
)


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"

AUTOMATION_JD = """
AI Automation Engineer

Build reliable LLM-powered workflows and agent tooling. The role uses Python,
n8n, LLM API integration, Prompt Engineering, Model Context Protocol, OAuth2,
PostgreSQL, and Docker. You will automate business processes and own systems
from development through production deployment.
"""


class TailoringPlanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)

    def test_aliases_are_matched_without_partial_word_false_positives(self):
        text = "Use Python, Golang, MCP, PostgreSQL, and docker-compose."
        matches = {item["name"] for item in find_matched_skills(self.profile, text)}

        self.assertIn("Python", matches)
        self.assertIn("Go", matches)
        self.assertIn("Model Context Protocol", matches)
        self.assertIn("PostgreSQL", matches)
        self.assertIn("Docker Compose", matches)
        self.assertNotIn("JavaScript", matches)

    def test_automation_plan_prioritizes_directly_supported_evidence(self):
        plan = build_tailoring_plan(
            self.profile,
            AUTOMATION_JD,
            target_title="AI Automation Engineer",
            max_achievements=8,
        )
        selected_ids = {item["id"] for item in plan["selected_achievements"]}
        matched_ids = {item["id"] for item in plan["matched_skills"]}

        self.assertIn("achievement_pragya_ai_pipeline", selected_ids)
        self.assertIn("achievement_pragya_ai_impact", selected_ids)
        self.assertIn("achievement_eventmcp_server", selected_ids)
        self.assertIn("skill_n8n", matched_ids)
        self.assertIn("skill_model_context_protocol", matched_ids)
        self.assertIn("skill_prompt_engineering", matched_ids)
        covered_skills = {
            skill_id
            for row in plan["ranking"]
            for skill_id in row["direct_skill_matches"]
        }
        self.assertTrue(matched_ids.issubset(covered_skills))

        ranking_by_id = {
            row["achievement_id"]: row for row in plan["ranking"]
        }
        for achievement in plan["selected_achievements"]:
            with self.subTest(achievement=achievement["id"]):
                row = ranking_by_id[achievement["id"]]
                self.assertTrue(
                    row["direct_skill_matches"]
                    or row["expanded_skill_matches"]
                    or row["semantic_similarity"] >= 0.08
                )
                self.assertTrue(achievement["source_excerpts"])

    def test_plan_only_selects_available_nodes_and_carries_supporting_skills(self):
        plan = build_tailoring_plan(
            self.profile,
            AUTOMATION_JD,
            target_title="AI Automation Engineer",
            max_achievements=5,
        )
        parent_ids = {item["id"] for item in plan["selected_parents"]}
        achievement_ids = {item["id"] for item in plan["selected_achievements"]}
        profile_achievements = {item["id"]: item for item in self.profile["achievements"]}

        self.assertLessEqual(len(achievement_ids), 5)
        self.assertTrue(parent_ids)
        self.assertTrue(plan["supporting_skills"])
        self.assertTrue(all(plan["audit"].values()))
        for parent in plan["selected_parents"]:
            with self.subTest(parent=parent["id"]):
                self.assertTrue(set(parent["achievement_ids"]) & achievement_ids)

        for achievement in plan["selected_achievements"]:
            with self.subTest(achievement=achievement["id"]):
                self.assertEqual(achievement, profile_achievements[achievement["id"]])

    def test_markdown_report_is_reviewable_and_auditable(self):
        plan = build_tailoring_plan(
            self.profile,
            AUTOMATION_JD,
            target_title="AI Automation Engineer",
            max_achievements=4,
        )
        report = render_plan_markdown(plan, self.profile)

        self.assertIn("# Resume tailoring plan", report)
        self.assertIn("Target title: **AI Automation Engineer**", report)
        self.assertIn("## Direct job-description skill matches", report)
        self.assertIn("## Selection audit", report)
        self.assertIn("PASS: every selected achievement has source excerpt", report)
        self.assertIn("## Ranking rationale", report)

    def test_empty_job_description_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "Job description must not be empty"):
            build_tailoring_plan(
                self.profile,
                " \n",
                target_title="Software Engineer",
            )

    def test_invalid_target_limits_are_rejected(self):
        for target_title in ("", " Software Engineer "):
            with self.subTest(target_title=target_title):
                with self.assertRaisesRegex(ValueError, "Target title"):
                    build_tailoring_plan(
                        self.profile,
                        AUTOMATION_JD,
                        target_title=target_title,
                    )

        with self.assertRaisesRegex(ValueError, "max_achievements"):
            build_tailoring_plan(
                self.profile,
                AUTOMATION_JD,
                target_title="Software Engineer",
                max_achievements=0,
            )


class TailoringCliTests(unittest.TestCase):
    def test_cli_writes_json_and_markdown(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "plans" / "automation.md"
            json_output = Path(directory) / "plans" / "automation.json"
            jd_path = Path(directory) / "job.txt"
            jd_path.write_text(AUTOMATION_JD, encoding="utf-8")

            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "resume_god",
                    "--profile",
                    str(PROFILE_PATH),
                    "--job-description-file",
                    str(jd_path),
                    "--target-title",
                    "AI Automation Engineer",
                    "--max-achievements",
                    "6",
                    "--output",
                    str(output),
                    "--json-output",
                    str(json_output),
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )

            self.assertEqual(completed.stdout, "")
            self.assertIn("# Resume tailoring plan", output.read_text(encoding="utf-8"))
            plan = json.loads(json_output.read_text(encoding="utf-8"))
            self.assertEqual(plan["target_title"], "AI Automation Engineer")
            self.assertTrue(all(plan["audit"].values()))


if __name__ == "__main__":
    unittest.main()
