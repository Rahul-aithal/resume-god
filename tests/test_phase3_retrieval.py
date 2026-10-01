import unittest
from pathlib import Path

from resume_god.graph import ProfileGraph
from resume_god.tailor import build_tailoring_plan, load_profile, render_plan_markdown


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"
TITLES = {
    1: "Software Developer",
    2: "Full Stack Developer",
    3: "Software Engineer I (SDE1)",
    4: "Product Engineer",
}


class RetrievalTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)
        cls.graph = ProfileGraph(cls.profile)

    def jd(self, number):
        return (ROOT / "fixtures" / "jds" / f"jd-{number}.txt").read_text(
            encoding="utf-8"
        )

    def plan(self, number, limit=7):
        return build_tailoring_plan(
            self.profile,
            self.jd(number),
            target_title=TITLES[number],
            max_achievements=limit,
        )

    def test_fixture_plans_use_exact_semantic_and_graph_retrieval(self):
        for number in TITLES:
            with self.subTest(jd=number):
                plan = self.plan(number)
                self.assertEqual(plan["selection_policy_version"], 2)
                self.assertEqual(plan["job_description_parse"]["provider"], "deterministic")
                self.assertEqual(plan["semantic_search"]["method"], "deterministic_tfidf_cosine")
                self.assertLessEqual(len(plan["semantic_search"]["top_matches"]), 5)
                self.assertEqual(plan["graph_expansion"]["hops"], 2)
                self.assertTrue(plan["graph_expansion"]["paths"])
                self.assertTrue(plan["ranking"])
                self.assertTrue(all(plan["audit"].values()))

                for row in plan["ranking"]:
                    self.assertIn("exact", row["score_components"])
                    self.assertIn("graph_expansion", row["score_components"])
                    self.assertIn("semantic", row["score_components"])
                    self.assertIn("recency", row["score_components"])
                    self.assertIn("metric", row["score_components"])
                    self.assertGreaterEqual(row["semantic_similarity"], 0)

    def test_requirement_coverage_and_gap_report_are_explicit(self):
        plan = self.plan(1)
        statuses = {row["status"] for row in plan["requirement_coverage"]}
        self.assertIn("covered", statuses)
        self.assertIn("profile_skill_without_evidence", statuses)
        self.assertIn("unknown_no_profile_match", statuses)

        unknown = {row["name"] for row in plan["gap_report"]["unknown_skills"]}
        self.assertIn("MySQL", unknown)
        profile_skill_ids = {
            skill["id"] for skill in self.profile["skills"]
        }
        for row in plan["requirement_coverage"]:
            if row["kind"] == "profile_skill":
                self.assertIn(row["id"], profile_skill_ids)

        unevidenced = {
            row["name"]
            for row in plan["gap_report"]["matched_but_unevidenced_skills"]
        }
        self.assertIn("Express.js", unevidenced)
        self.assertIn("JavaScript", unevidenced)
        self.assertIn("GitHub", unevidenced)

    def test_semantic_similarity_and_graph_expansion_are_deterministic(self):
        query = "LLM agent calendar tool"
        first = self.graph.search_bullets(query, limit=5)
        second = self.graph.search_bullets(query, limit=5)
        self.assertEqual(first, second)
        self.assertGreater(first[0]["similarity"], 0)

        expanded = self.graph.expand_skills("skill_model_context_protocol", hops=2)
        ids = {skill["id"] for skill in expanded}
        self.assertIn("skill_go", ids)

        plan = self.plan(4)
        self.assertTrue(plan["semantic_search"]["top_matches"])

    def test_selected_evidence_stays_traceable_and_unchanged(self):
        original = {
            achievement["id"]: achievement
            for achievement in self.profile["achievements"]
        }
        for number in TITLES:
            with self.subTest(jd=number):
                plan = self.plan(number)
                for achievement in plan["selected_achievements"]:
                    self.assertEqual(achievement, original[achievement["id"]])
                    self.assertTrue(achievement["source_excerpts"])

    def test_markdown_report_shows_scoring_and_gaps(self):
        report = render_plan_markdown(self.plan(1), self.profile)
        self.assertIn("## Retrieval details", report)
        self.assertIn("deterministic_tfidf_cosine", report)
        self.assertIn("## Requirement coverage and gaps", report)
        self.assertIn("MySQL", report)
        self.assertIn("**Matched but unevidenced:**", report)
        self.assertIn("components:", report)


if __name__ == "__main__":
    unittest.main()
