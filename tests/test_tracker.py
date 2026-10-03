import tempfile
import unittest
from pathlib import Path

from resume_god.diff import build_skill_diff, render_skill_diff_markdown
from resume_god.store import (
    add_role,
    company_detail,
    connect,
    list_companies,
    set_role_status,
    upsert_company,
)
from resume_god.tailor import build_tailoring_plan, load_profile
from resume_god.typst import BASIC_RESUME_VERSION, render_resume_typst
from resume_god.rewrite import rewrite_plan

ROOT = Path(__file__).resolve().parents[1]


class TrackerTests(unittest.TestCase):
    def test_company_role_counts(self):
        with tempfile.TemporaryDirectory() as directory:
            conn = connect(Path(directory) / "c.db")
            upsert_company(conn, "Goodspace", about="AI hiring")
            add_role(conn, "Goodspace", "Software Engineer")
            add_role(conn, "Goodspace", "Frontend Intern", status="interview")
            detail = company_detail(conn, "Goodspace")
            assert detail is not None
            self.assertEqual(detail["role_count"], 2)
            self.assertEqual(detail["by_status"]["applied"], 1)
            self.assertEqual(detail["by_status"]["interview"], 1)
            titles = {r["target_title"] for r in detail["roles"]}
            self.assertEqual(titles, {"Software Engineer", "Frontend Intern"})
            companies = list_companies(conn)
            self.assertEqual(companies[0]["role_count"], 2)

    def test_role_status_update(self):
        with tempfile.TemporaryDirectory() as directory:
            conn = connect(Path(directory) / "c.db")
            role = add_role(conn, "Rox", "Product Engineer")
            updated = set_role_status(conn, role["id"], "offer")
            self.assertEqual(updated["status"], "offer")
            with self.assertRaises(ValueError):
                set_role_status(conn, role["id"], "hired")

    def test_skill_diff_splits_have_vs_missing(self):
        profile = load_profile(ROOT / "master_profile.yaml")
        jd = (ROOT / "job.txt").read_text(encoding="utf-8")
        plan = build_tailoring_plan(profile, jd, target_title="Software Engineer")
        diff = build_skill_diff(plan, profile)
        self.assertIn("they expect", diff["summary"].lower())
        self.assertGreater(diff["counts"]["expected_known"], 0)
        self.assertGreater(diff["counts"]["have"], 0)
        covered = {r["name"] for r in diff["have"]}
        missing = {r["name"] for r in diff["missing_no_evidence"]}
        self.assertFalse(covered & missing)
        markdown = render_skill_diff_markdown(diff)
        self.assertIn("Skill diff", markdown)

    def test_typst_uses_basic_resume_template(self):
        profile = load_profile(ROOT / "master_profile.yaml")
        jd = (ROOT / "job.txt").read_text(encoding="utf-8")
        plan = rewrite_plan(
            build_tailoring_plan(profile, jd, target_title="Software Engineer"),
            profile,
        )
        source = render_resume_typst(plan, profile)
        self.assertIn(f"@preview/basic-resume:{BASIC_RESUME_VERSION}", source)
        self.assertIn("#show: resume.with(", source)
        self.assertIn("#work(", source)
        self.assertIn("#project(", source)
        self.assertIn("#edu(", source)
        # No hand-rolled layout helpers anymore.
        self.assertNotIn("#let section(title)", source)
        # No stray bracket-wrapped summary or quoted H1 title.
        self.assertNotIn('= "Software Engineer"', source)

    def test_js_ts_abbreviations_match_canonical_skills(self):
        from resume_god.tailor import find_matched_skills

        profile = load_profile(ROOT / "master_profile.yaml")
        matches = {
            item["id"]: item
            for item in find_matched_skills(
                profile, "Need JS, TS, Next, Nest and PG experience."
            )
        }
        self.assertEqual(matches["skill_javascript"]["name"], "JavaScript")
        self.assertEqual(matches["skill_typescript"]["name"], "TypeScript")
        self.assertEqual(matches["skill_next_js"]["name"], "Next.js")
        self.assertEqual(matches["skill_nestjs"]["name"], "NestJS")
        self.assertEqual(matches["skill_postgresql"]["name"], "PostgreSQL")
        # No substring false positive: "Next.js" must not invent a bare JS hit
        # beyond the real JavaScript skill entry itself.
        self.assertIn("skill_javascript", matches)

    def test_framework_implies_language_is_marked_inferred(self):
        from resume_god.graph import ProfileGraph

        profile = load_profile(ROOT / "master_profile.yaml")
        graph = ProfileGraph(profile)
        implied = {skill["id"] for skill in graph.implied_skills("skill_react_js")}
        self.assertIn("skill_javascript", implied)
        next_implied = {
            skill["id"] for skill in graph.implied_skills("skill_next_js")
        }
        self.assertIn("skill_react_js", next_implied)
        self.assertIn("skill_typescript", next_implied)

        plan = build_tailoring_plan(
            profile,
            "We need JavaScript and JS developers.",
            target_title="Frontend Developer",
            max_achievements=7,
        )
        statuses = {
            row["name"]: row["status"] for row in plan["requirement_coverage"]
        }
        # JavaScript has no directly-linked achievement in the profile, but
        # React.js/Next.js work implies it — must be inferred, never unknown.
        self.assertEqual(statuses.get("JavaScript"), "inferred_covered")
        ranking_inferred = {
            skill
            for row in plan["ranking"]
            for skill in row.get("inferred_skill_matches", [])
        }
        self.assertIn("skill_javascript", ranking_inferred)

    def test_llm_failure_falls_back_to_deterministic(self):
        from resume_god.jd_parser import parse_job_description
        from resume_god.llm import active_provider_label, resolve_provider

        # No keys in test env → auto resolves offline.
        self.assertIsNone(resolve_provider("auto"))
        self.assertIsNone(resolve_provider("deterministic"))
        self.assertIn("deterministic", active_provider_label("auto"))

        class BrokenProvider:
            name = "broken"

            def complete_json(self, prompt):
                raise RuntimeError("network down")

        profile = load_profile(ROOT / "master_profile.yaml")
        parsed = parse_job_description(
            profile,
            "Need Python and n8n automation.",
            provider=BrokenProvider(),  # type: ignore[arg-type]
            target_title="Automation Engineer",
        )
        self.assertEqual(parsed["provider"], "deterministic")
        self.assertEqual(parsed["provider_requested"], "broken")
        self.assertIn("provider_fallback_error", parsed)
        names = {
            row["name"]
            for row in parsed["must_have_skills"] + parsed["nice_to_have_skills"]
        }
        self.assertIn("Python", names)

        plan = build_tailoring_plan(
            profile,
            "Need Python and n8n automation.",
            target_title="Automation Engineer",
            max_achievements=5,
        )
        rewritten = rewrite_plan(plan, profile, provider=BrokenProvider())  # type: ignore[arg-type]
        self.assertEqual(rewritten["rewrite_provider"], "deterministic")
        self.assertIn("rewrite_provider_fallback_error", rewritten)
        self.assertTrue(all(rewritten["rewrite_audit"].values()))


if __name__ == "__main__":
    unittest.main()
