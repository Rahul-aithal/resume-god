import json
import os
import subprocess
import sys
import unittest

from resume_god.graph import ProfileGraph
from resume_god.tailor import load_profile


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class GraphSchemaTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.profile = load_profile(os.path.join(ROOT, "master_profile.yaml"))
        cls.graph = ProfileGraph(cls.profile)

    def test_graph_schema_and_direct_queries(self):
        go_bullets = self.graph.bullets_for_skill("skill_go")
        self.assertTrue(go_bullets)
        self.assertTrue(
            all("skill_go" in achievement["skills"] for achievement in go_bullets)
        )

        eventmcp_skills = {
            skill["id"]
            for skill in self.graph.skills_for_project("project_eventmcp")
        }
        self.assertIn("skill_go", eventmcp_skills)
        self.assertIn("skill_model_context_protocol", eventmcp_skills)

        adjacent = self.graph.expand_skills("skill_model_context_protocol", hops=2)
        self.assertIn("skill_go", {skill["id"] for skill in adjacent})

    def test_semantic_search_returns_five_ranked_bullets(self):
        results = self.graph.search_bullets(
            "LLM agent tooling with Model Context Protocol and calendar APIs",
            limit=5,
        )
        self.assertTrue(results)
        self.assertLessEqual(len(results), 5)
        scores = [row["similarity"] for row in results]
        self.assertEqual(scores, sorted(scores, reverse=True))
        ids = {row["achievement"]["id"] for row in results}
        self.assertIn("achievement_eventmcp_server", ids)

    def test_graph_projection_is_deterministic(self):
        rebuilt = ProfileGraph(load_profile(os.path.join(ROOT, "master_profile.yaml")))
        self.assertEqual(self.graph.vocabulary, rebuilt.vocabulary)
        records = self.graph.export_records()
        self.assertEqual(records["skills"][0]["id"], "skill_python")
        self.assertTrue(all(row["embedding"] for row in records["achievements"]))
        relationship_types = {row["type"] for row in records["relationships"]}
        self.assertEqual({"USES", "PART_OF", "DEMONSTRATES"}, relationship_types)

    def test_graph_cli_queries_offline(self):
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "resume_god.graph",
                "--profile",
                os.path.join(ROOT, "master_profile.yaml"),
                "query",
                "--skill",
                "Go",
                "--project",
                "project_eventmcp",
                "--search",
                "LLM agent calendar tool",
                "--limit",
                "5",
            ],
            check=True,
            capture_output=True,
            text=True,
            cwd=ROOT,
        )
        decoder = json.JSONDecoder()
        payload, offset = decoder.raw_decode(completed.stdout)
        self.assertIsInstance(payload, list)
        self.assertTrue(payload)
        self.assertTrue(completed.stdout[offset:].strip())


class OptionalNeo4jTests(unittest.TestCase):
    def test_loads_idempotently_when_configured(self):
        uri = os.environ.get("RESUME_GOD_NEO4J_URI")
        password = os.environ.get("RESUME_GOD_NEO4J_PASSWORD")
        if not uri or not password:
            self.skipTest("Set RESUME_GOD_NEO4J_URI and RESUME_GOD_NEO4J_PASSWORD")
        from resume_god.graph import load_into_neo4j

        profile = load_profile(os.path.join(ROOT, "master_profile.yaml"))
        graph = ProfileGraph(profile)
        first = load_into_neo4j(graph, uri=uri, user="neo4j", password=password)
        second = load_into_neo4j(graph, uri=uri, user="neo4j", password=password)
        self.assertEqual(first, second)
        self.assertEqual(first["achievements"], len(profile["achievements"]))


if __name__ == "__main__":
    unittest.main()
