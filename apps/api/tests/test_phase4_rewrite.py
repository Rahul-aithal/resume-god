import unittest
from pathlib import Path

from resume_god.assembly import build_assembly
from resume_god.render import render_resume_html, render_resume_markdown
from resume_god.rewrite import (
    revalidate_plan_rewrites,
    rewrite_plan,
    validate_rewrite,
)
from resume_god.tailor import build_tailoring_plan, load_profile

from tests.test_phase1_tailoring import AUTOMATION_JD


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


class SafeRewriteProvider:
    def complete_json(self, prompt):
        self.prompt = prompt
        return {
            "rewrites": [
                {
                    "achievement_id": "achievement_eventmcp_server",
                    "text": "Built an MCP server in Go exposing Google Calendar as a callable tool layer for LLM agents.",
                }
            ]
        }


class DangerousRewriteProvider:
    def complete_json(self, prompt):
        return {
            "rewrites": [
                {
                    "achievement_id": "achievement_eventmcp_server",
                    "text": "Built 5 MCP servers in Go, Docker, and Kubernetes for LLM agents.",
                }
            ]
        }


class RewriteAssemblyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)
        cls.plan = build_tailoring_plan(
            cls.profile,
            AUTOMATION_JD,
            target_title="AI Automation Engineer",
            max_achievements=8,
        )

    def achievement(self, achievement_id):
        return next(
            item
            for item in self.profile["achievements"]
            if item["id"] == achievement_id
        )

    def test_grounding_validator_catches_fake_claims(self):
        source = self.achievement("achievement_eventmcp_server")
        cases = {
            "new number": "Built 5 MCP servers in Go for LLM agents.",
            "new profile skill": "Built an MCP server in Go and Docker for LLM agents.",
            "new technology": "Built an MCP server in Go and Kubernetes for LLM agents.",
            "new acronym": "Built an MCP and RAG server in Go for LLM agents.",
        }
        for label, rewritten in cases.items():
            with self.subTest(case=label):
                passed, issues = validate_rewrite(
                    source["text"], rewritten, source, self.profile
                )
                self.assertFalse(passed)
                self.assertTrue(issues)

        passed, issues = validate_rewrite(
            source["text"],
            "Built an MCP server in Go exposing Google Calendar as a callable tool layer for LLM agents.",
            source,
            self.profile,
        )
        self.assertTrue(passed)
        self.assertEqual(issues, [])

    def test_safe_rewrite_is_used_and_rendered(self):
        provider = SafeRewriteProvider()
        rewritten = rewrite_plan(
            self.plan,
            self.profile,
            provider=provider,
            summary="Reviewed AI automation summary.",
        )
        record = rewritten["rewrites"]["achievement_eventmcp_server"]
        self.assertTrue(record["used_rewrite"])
        self.assertEqual(record["status"], "used")
        self.assertTrue(all(rewritten["rewrite_audit"].values()))
        self.assertEqual(rewritten["rewrite_summary"]["used_rewrite_count"], 1)
        self.assertIn("Target title: AI Automation Engineer", provider.prompt)
        self.assertIn("Preserve every technology", provider.prompt)

        markdown = render_resume_markdown(
            rewritten,
            self.profile,
            summary="Reviewed AI automation summary.",
        )
        html = render_resume_html(
            rewritten,
            self.profile,
            summary="Reviewed AI automation summary.",
        )
        safe_text = "Built an MCP server in Go exposing Google Calendar"
        self.assertIn(safe_text, markdown)
        self.assertIn(safe_text, html)

    def test_failed_rewrite_falls_back_to_reviewed_original(self):
        rewritten = rewrite_plan(
            self.plan,
            self.profile,
            provider=DangerousRewriteProvider(),
        )
        record = rewritten["rewrites"]["achievement_eventmcp_server"]
        self.assertFalse(record["used_rewrite"])
        self.assertEqual(record["status"], "fallback_original")
        self.assertEqual(record["rewritten_text"], record["source_text"])
        self.assertIn("new numeric claims", " ".join(record["issues"]))
        self.assertTrue(all(rewritten["rewrite_audit"].values()))
        self.assertEqual(rewritten["rewrite_summary"]["used_rewrite_count"], 0)

    def test_without_provider_every_bullet_falls_back(self):
        rewritten = rewrite_plan(self.plan, self.profile)
        self.assertTrue(rewritten["rewrites"])
        self.assertTrue(all(not row["used_rewrite"] for row in rewritten["rewrites"].values()))
        self.assertTrue(all(rewritten["rewrite_audit"].values()))

    def test_assembly_orders_by_relevance_and_trims_lowest_ranked(self):
        assembly = build_assembly(
            self.plan,
            self.profile,
            page_budget_chars=700,
            summary="Short summary.",
        )
        ranking_ids = [row["achievement_id"] for row in self.plan["ranking"]]
        self.assertLess(len(assembly["retained_achievement_ids"]), len(ranking_ids))
        self.assertTrue(assembly["trimmed_achievement_ids"])
        self.assertEqual(
            assembly["trimmed_achievement_ids"],
            list(reversed(ranking_ids[len(assembly["retained_achievement_ids"]) :])),
        )
        self.assertEqual(
            assembly["section_order"],
            list(dict.fromkeys(item["kind"] for item in assembly["selected_parents"])),
        )
        for parent in assembly["selected_parents"]:
            positions = {
                achievement_id: assembly["retained_achievement_ids"].index(
                    achievement_id
                )
                for achievement_id in parent["achievement_ids"]
            }
            self.assertEqual(
                parent["achievement_ids"],
                sorted(parent["achievement_ids"], key=lambda item: positions[item]),
            )


    def test_review_gate_accepts_safe_edit_and_rejects_invented_claims(self):
        reviewed = rewrite_plan(self.plan, self.profile)
        target = "achievement_eventmcp_server"
        reviewed["rewrites"][target]["rewritten_text"] = (
            "Built an MCP server in Go exposing Google Calendar as a callable "
            "tool layer for LLM agents."
        )
        reviewed["rewrites"][target]["used_rewrite"] = True
        rejected = revalidate_plan_rewrites(reviewed, self.profile)
        self.assertEqual(rejected, [])
        self.assertTrue(reviewed["rewrites"][target]["used_rewrite"])
        self.assertTrue(all(reviewed["rewrite_audit"].values()))

    def test_review_gate_falls_back_when_edit_invents_technology(self):
        reviewed = rewrite_plan(self.plan, self.profile)
        target = "achievement_eventmcp_server"
        reviewed["rewrites"][target]["rewritten_text"] = (
            "Built 5 MCP servers in Go, Docker, and Kubernetes for LLM agents."
        )
        reviewed["rewrites"][target]["used_rewrite"] = True
        rejected = revalidate_plan_rewrites(reviewed, self.profile)
        self.assertEqual(rejected, [target])
        record = reviewed["rewrites"][target]
        self.assertFalse(record["used_rewrite"])
        self.assertEqual(record["rewritten_text"], record["source_text"])
        self.assertTrue(all(reviewed["rewrite_audit"].values()))

    def test_review_gate_refuses_edited_reviewed_facts(self):
        reviewed = rewrite_plan(self.plan, self.profile)
        target = "achievement_eventmcp_server"
        reviewed["rewrites"][target]["source_text"] = "Tampered source text."
        with self.assertRaisesRegex(ValueError, "must match master_profile"):
            revalidate_plan_rewrites(reviewed, self.profile)


if __name__ == "__main__":
    unittest.main()
