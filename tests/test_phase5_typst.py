import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from pypdf import PdfReader

from resume_god.rewrite import rewrite_plan
from resume_god.tailor import build_tailoring_plan, load_profile
from resume_god.typst import render_resume_typst, typst_binary, write_resume_pdf


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"
TITLES = {
    1: "Software Developer",
    2: "Full Stack Developer",
    3: "Software Engineer I (SDE1)",
    4: "Product Engineer",
}


def typst_available() -> bool:
    try:
        typst_binary()
        return True
    except RuntimeError:
        return False


@unittest.skipUnless(typst_available(), "Typst is required for PDF rendering")
class TypstRenderingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)

    def jd_path(self, number):
        return ROOT / "fixtures" / "jds" / f"jd-{number}.txt"

    def test_fixture_jds_each_render_one_page_pdf(self):
        with tempfile.TemporaryDirectory() as directory:
            for number, title in TITLES.items():
                with self.subTest(jd=number):
                    plan = build_tailoring_plan(
                        self.profile,
                        self.jd_path(number).read_text(encoding="utf-8"),
                        target_title=title,
                        max_achievements=7,
                    )
                    assembled = rewrite_plan(plan, self.profile)
                    output = Path(directory) / f"jd-{number}.pdf"
                    adjusted, result = write_resume_pdf(
                        assembled,
                        self.profile,
                        output,
                    )

                    self.assertEqual(result["page_count"], 1)
                    self.assertTrue(result["audit_passed"])
                    self.assertTrue(all(adjusted["audit"].values()))
                    self.assertTrue(all(adjusted["rewrite_audit"].values()))
                    reader = PdfReader(str(output))
                    self.assertEqual(len(reader.pages), 1)
                    extracted = reader.pages[0].extract_text() or ""
                    self.assertIn("Rahul Aithal", extracted)
                    self.assertIn("Professional Summary", extracted)
                    self.assertIn("Technical Skills", extracted)

    def test_pdf_overflow_trims_lowest_ranked_bullets(self):
        with tempfile.TemporaryDirectory() as directory:
            plan = build_tailoring_plan(
                self.profile,
                self.jd_path(1).read_text(encoding="utf-8"),
                target_title="Software Developer",
                max_achievements=30,
            )
            assembled = rewrite_plan(
                plan,
                self.profile,
                page_budget_chars=1_000_000,
            )
            output = Path(directory) / "overflow.pdf"
            adjusted, result = write_resume_pdf(
                assembled,
                self.profile,
                output,
            )

            self.assertEqual(result["page_count"], 1)
            self.assertTrue(result["trimmed_for_one_page"])
            self.assertGreater(result["attempts"][0]["page_count"], 1)
            self.assertLess(
                len(adjusted["selected_achievements"]),
                len(assembled["selected_achievements"]),
            )
            trimmed = set(result["trimmed_for_one_page"])
            selected = {item["id"] for item in adjusted["selected_achievements"]}
            self.assertFalse(trimmed & selected)
            self.assertEqual(len(PdfReader(str(output)).pages), 1)

    def test_typst_source_is_single_column_a4_and_escapes_untrusted_text(self):
        plan = rewrite_plan(
            build_tailoring_plan(
                self.profile,
                self.jd_path(4).read_text(encoding="utf-8"),
                target_title="Product Engineer",
                max_achievements=5,
            ),
            self.profile,
        )
        source = render_resume_typst(plan, self.profile)
        self.assertIn('@preview/basic-resume:0.2.9', source)
        self.assertIn('#show: resume.with(', source)
        self.assertIn('paper: "a4"', source)
        self.assertIn("New Computer Modern", source)
        self.assertIn("== Professional Summary", source)
        self.assertIn("== Technical Skills", source)
        self.assertIn("#work(", source)
        self.assertIn("#project(", source)
        self.assertIn("#edu(", source)
        self.assertNotIn("#let section(title)", source)
        self.assertNotIn("#entry-heading", source)

    def test_missing_typst_binary_has_actionable_error(self):
        if Path(".venv/bin/typst").exists() and not shutil.which("typst"):
            # The repository-local binary exists, so force resolution through
            # a nonexistent override and verify the user-facing error.
            with tempfile.TemporaryDirectory() as directory:
                missing = Path(directory) / "missing-typst"
                with self.assertRaisesRegex(RuntimeError, "install-typst"):
                    typst_binary(missing)
        else:
            with self.assertRaisesRegex(RuntimeError, "Typst was not found"):
                typst_binary("/definitely/not/typst")


@unittest.skipUnless(typst_available(), "Typst is required for the PDF CLI")
class TypstCliTests(unittest.TestCase):
    def test_tailor_command_writes_pdf_report_and_json(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "resume.pdf"
            completed = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "resume_god.cli",
                    "tailor",
                    str(ROOT / "fixtures" / "jds" / "jd-1.txt"),
                    "--profile",
                    str(PROFILE_PATH),
                    "--target-title",
                    "Software Developer",
                    "--max-achievements",
                    "7",
                    "--out",
                    str(output),
                    "--source-output",
                    str(Path(directory) / "resume.typ"),
                ],
                check=True,
                capture_output=True,
                text=True,
                cwd=ROOT,
            )

            self.assertIn("resume.pdf", completed.stdout)
            self.assertEqual(len(PdfReader(str(output)).pages), 1)
            report = (Path(directory) / "resume-report.md").read_text(
                encoding="utf-8"
            )
            machine = json.loads(
                (Path(directory) / "resume-plan.json").read_text(encoding="utf-8")
            )
            self.assertIn("## Requirement coverage and gaps", report)
            self.assertIn("## Assembly and constrained rewriting", report)
            self.assertIn("## PDF output", report)
            self.assertIn("Typst", report)
            self.assertEqual(machine["pdf"]["page_count"], 1)
            self.assertTrue(machine["pdf"]["audit_passed"])
            self.assertIn("assembly", machine)
            self.assertIn("rewrites", machine)
            self.assertTrue((Path(directory) / "resume.typ").is_file())


if __name__ == "__main__":
    unittest.main()
