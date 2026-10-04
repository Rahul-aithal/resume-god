import subprocess
import sys
import tempfile
import unittest
import re
from copy import deepcopy
from pathlib import Path

from resume_god.render import render_resume_html, render_resume_markdown
from resume_god.tailor import build_tailoring_plan, load_profile


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"

AUTOMATION_JD = """
AI Automation Engineer

Build reliable LLM-powered workflows and agent tooling. The role uses Python,
n8n, LLM API integration, Prompt Engineering, Model Context Protocol, OAuth2,
PostgreSQL, and Docker. You will automate business processes and own systems
from development through production deployment.
"""


class ResumeRenderingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)
        cls.plan = build_tailoring_plan(
            cls.profile,
            AUTOMATION_JD,
            target_title="AI Automation Engineer",
            max_achievements=8,
        )

    def test_markdown_resume_renders_only_selected_reviewed_evidence(self):
        resume = render_resume_markdown(self.plan, self.profile)
        selected = {
            item["id"]: item for item in self.plan["selected_achievements"]
        }
        profile_achievements = {
            item["id"]: item for item in self.profile["achievements"]
        }

        self.assertIn("# Rahul Aithal", resume)
        self.assertIn("## AI Automation Engineer", resume)
        self.assertIn("## Professional Summary", resume)
        self.assertIn("## Skills", resume)
        self.assertIn("## Education", resume)
        self.assertIn("## Certifications", resume)
        self.assertIn("Feb 2025 – Apr 2026", resume)
        self.assertEqual(resume.count("## Selected Projects"), 1)
        self.assertNotIn("2026 – 2026", resume)
        self.assertIn("*https://github.com/Rahul-aithal/EventMCP · 2026*", resume)
        self.assertIn("MongoDB University (Mar 2025)", resume)
        self.assertNotIn("experience/project nodes", resume)

        for achievement_id, achievement in selected.items():
            with self.subTest(achievement=achievement_id):
                self.assertIn(achievement["text"], resume)

        for achievement_id, achievement in profile_achievements.items():
            if achievement_id not in selected:
                self.assertNotIn(achievement["text"], resume)

        skills_section = resume.split("## Skills", 1)[1]
        if "## Relevant Experience" in skills_section:
            skills_section = skills_section.split("## Relevant Experience", 1)[0]
        elif "## Selected Projects" in skills_section:
            skills_section = skills_section.split("## Selected Projects", 1)[0]
        selected_skill_names = {
            skill["name"]
            for skill in self.profile["skills"]
            if skill["id"]
            in {
                skill_id
                for achievement in selected.values()
                for skill_id in achievement["skills"]
            }
        }
        absent_skill_names = {
            skill["name"]
            for skill in self.profile["skills"]
            if skill["name"] not in selected_skill_names
        }
        self.assertTrue(selected_skill_names)
        self.assertTrue(absent_skill_names)
        for name in selected_skill_names:
            self.assertRegex(skills_section, rf"(?<!\w){re.escape(name)}(?!\w)")
        for name in absent_skill_names:
            self.assertIsNone(
                re.search(rf"(?<!\w){re.escape(name)}(?!\w)", skills_section),
                f"Unselected skill unexpectedly rendered: {name}",
            )

    def test_custom_summary_is_used_and_validated(self):
        resume = render_resume_markdown(
            self.plan,
            self.profile,
            summary="User-reviewed summary for this specific application.",
        )
        self.assertIn("User-reviewed summary for this specific application.", resume)

        for summary in ("", " padded "):
            with self.subTest(summary=summary):
                with self.assertRaisesRegex(ValueError, "Custom summary"):
                    render_resume_markdown(self.plan, self.profile, summary=summary)

    def test_failed_plan_or_unreviewed_profile_is_rejected(self):
        failed_plan = deepcopy(self.plan)
        failed_plan["audit"]["achievement_text_is_unchanged"] = False
        unreviewed_profile = deepcopy(self.profile)
        unreviewed_profile["status"] = "draft"

        with self.assertRaisesRegex(ValueError, "failed audit"):
            render_resume_markdown(failed_plan, self.profile)
        with self.assertRaisesRegex(ValueError, "unreviewed profile"):
            render_resume_markdown(self.plan, unreviewed_profile)

    def test_html_resume_is_self_contained_and_escapes_untrusted_text(self):
        unsafe_plan = deepcopy(self.plan)
        unsafe_plan["target_title"] = "<script>alert('resume')</script>"
        html = render_resume_html(unsafe_plan, self.profile)

        self.assertTrue(html.startswith("<!doctype html>"))
        self.assertIn('<meta charset="utf-8">', html)
        self.assertIn("data-plan-audit=\"pass\"", html)
        self.assertIn("&lt;script&gt;alert(&#x27;resume&#x27;)&lt;/script&gt;", html)
        self.assertNotIn("<script>alert('resume')</script>", html)
        self.assertIn("https://github.com/Rahul-aithal/EventMCP", html)


class ResumeCliTests(unittest.TestCase):
    def test_cli_writes_plan_and_resume_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            jd_path = root / "job.txt"
            plan_path = root / "output" / "plan.md"
            json_path = root / "output" / "plan.json"
            resume_path = root / "output" / "resume.md"
            html_path = root / "output" / "resume.html"
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
                    "7",
                    "--output",
                    str(plan_path),
                    "--json-output",
                    str(json_path),
                    "--resume-output",
                    str(resume_path),
                    "--resume-html-output",
                    str(html_path),
                    "--summary",
                    "Reviewed summary supplied through the CLI.",
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )

            self.assertEqual(completed.stdout, "")
            self.assertIn("# Resume tailoring plan", plan_path.read_text(encoding="utf-8"))
            self.assertIn("# Rahul Aithal", resume_path.read_text(encoding="utf-8"))
            self.assertIn(
                "Reviewed summary supplied through the CLI.",
                resume_path.read_text(encoding="utf-8"),
            )
            html = html_path.read_text(encoding="utf-8")
            self.assertIn("<!doctype html>", html)
            self.assertIn("Reviewed summary supplied through the CLI.", html)


if __name__ == "__main__":
    unittest.main()
