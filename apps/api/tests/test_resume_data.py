import json
import unittest
from pathlib import Path

from resume_god.resume_data import (
    RESUME_DATA_VERSION,
    build_evidence_pack,
    build_resume_data,
    narrow_plan_ranking,
    select_resume_bullets,
    validate_resume_data,
)
from resume_god.typst import _drop_bullet_from_data
from resume_god.rewrite import rewrite_plan
from resume_god.tailor import build_tailoring_plan, load_profile


ROOT = Path(__file__).resolve().parents[1]
PROFILE_PATH = ROOT / "master_profile.yaml"


class FakeSelectProvider:
    name = "gemini"

    def __init__(self, selected):
        self.selected = selected

    def complete_json(self, prompt):
        assert "candidate_bullets" in prompt
        return {"selected": self.selected}


class FailingSelectProvider:
    name = "gemini"

    def complete_json(self, prompt):
        raise RuntimeError("boom")


class ResumeDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(PROFILE_PATH)
        jd = (ROOT / "fixtures" / "jds" / "jd-1.txt").read_text(encoding="utf-8")
        cls.plan = build_tailoring_plan(
            cls.profile, jd, target_title="Software Developer", max_achievements=6
        )

    def test_evidence_pack_draws_from_ranking(self):
        pack = build_evidence_pack(self.plan, self.profile, candidate_pool=8)
        self.assertEqual(pack["target_title"], "Software Developer")
        self.assertLessEqual(len(pack["candidate_bullets"]), 8)
        ranking_ids = [row["achievement_id"] for row in self.plan["ranking"][:8]]
        self.assertEqual(
            [item["achievement_id"] for item in pack["candidate_bullets"]],
            ranking_ids,
        )
        for item in pack["candidate_bullets"]:
            self.assertIn("source_text", item)
            self.assertIn("skills", item)

    def test_select_keeps_llm_order_and_drops_unknown_ids(self):
        ranking_ids = [row["achievement_id"] for row in self.plan["ranking"]]
        wanted = [ranking_ids[2], "nope-not-real", ranking_ids[0], ranking_ids[2]]
        selection = select_resume_bullets(
            self.plan,
            self.profile,
            provider=FakeSelectProvider(wanted),
            max_select=4,
        )
        self.assertEqual(selection["provider"], "gemini")
        self.assertEqual(selection["dropped_ids"], ["nope-not-real"])
        self.assertEqual(selection["selected_ids"][:2], [ranking_ids[2], ranking_ids[0]])
        self.assertEqual(len(selection["selected_ids"]), 4)
        self.assertTrue(selection["refilled_ids"])

    def test_select_failure_falls_back_to_ranking(self):
        selection = select_resume_bullets(
            self.plan,
            self.profile,
            provider=FailingSelectProvider(),
            max_select=3,
        )
        self.assertEqual(selection["provider"], "deterministic")
        self.assertIn("boom", selection["fallback_error"])
        ranking_ids = [row["achievement_id"] for row in self.plan["ranking"]]
        self.assertEqual(selection["selected_ids"], ranking_ids[:3])

    def test_narrow_plan_ranking_reorders(self):
        ranking_ids = [row["achievement_id"] for row in self.plan["ranking"]]
        wanted = [ranking_ids[1], ranking_ids[0]]
        narrowed = narrow_plan_ranking(self.plan, wanted)
        self.assertEqual(
            [row["achievement_id"] for row in narrowed["ranking"]], wanted
        )
        # Original untouched.
        self.assertEqual(
            [row["achievement_id"] for row in self.plan["ranking"]][:2],
            ranking_ids[:2],
        )

    def test_build_resume_data_schema(self):
        rewritten = rewrite_plan(self.plan, self.profile)
        data = build_resume_data(rewritten, self.profile, font=None, summary=None)
        self.assertEqual(data["version"], RESUME_DATA_VERSION)
        self.assertEqual(data["font"], "Calibri")
        self.assertIn("contact", data)
        self.assertTrue(data["sections"])
        for section in data["sections"]:
            self.assertEqual(len(section["achievement_ids"]), len(section["bullets"]))
            self.assertIn(section["kind"], ("experience", "project"))
            self.assertIn("dates", section)
        self.assertTrue(data["education"])
        self.assertIsInstance(data["certifications"], list)

    def test_validate_drops_unknown_ids_and_falls_back_bad_text(self):
        rewritten = rewrite_plan(self.plan, self.profile)
        data = build_resume_data(rewritten, self.profile, font=None, summary=None)
        first = data["sections"][0]
        real_id = first["achievement_ids"][0]
        first["achievement_ids"].append("ghost-id")
        first["bullets"].append("Ghost bullet.")
        # Invent a technology in a real bullet: must fall back to source.
        first["bullets"][0] = first["bullets"][0] + " using Kubernetes clusters."
        report = validate_resume_data(data, self.profile)
        self.assertEqual(report["dropped_bullets"], ["ghost-id"])
        self.assertEqual(report["fallback_bullets"], [real_id])
        cleaned_first = report["data"]["sections"][0]
        achievements = {item["id"]: item for item in self.profile["achievements"]}
        self.assertEqual(
            cleaned_first["bullets"][0], achievements[real_id]["text"]
        )
        self.assertTrue(report["issues"])

    def test_validate_flags_bad_version(self):
        rewritten = rewrite_plan(self.plan, self.profile)
        data = build_resume_data(rewritten, self.profile, font=None, summary=None)
        data["version"] = 999
        report = validate_resume_data(data, self.profile)
        self.assertTrue(any("version" in issue for issue in report["issues"]))

    def test_drop_bullet_removes_emptied_sections(self):
        data = {
            "sections": [
                {
                    "kind": "project",
                    "achievement_ids": ["solo"],
                    "bullets": ["Solo bullet."],
                },
                {
                    "kind": "experience",
                    "achievement_ids": ["a", "b"],
                    "bullets": ["A.", "B."],
                },
            ]
        }
        self.assertTrue(_drop_bullet_from_data(data, "solo"))
        self.assertEqual(len(data["sections"]), 1)
        self.assertEqual(data["sections"][0]["achievement_ids"], ["a", "b"])
        self.assertTrue(_drop_bullet_from_data(data, "a"))
        self.assertEqual(data["sections"][0]["bullets"], ["B."])
        self.assertFalse(_drop_bullet_from_data(data, "missing"))


if __name__ == "__main__":
    unittest.main()
