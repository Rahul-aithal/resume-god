import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import { parseJobDescription, type Profile } from "../src/pipeline/jd-parser";
import type { LlmProvider } from "../src/llm/llm-provider.interface";

const FIXTURES = join(import.meta.dir, "fixtures");
const profile = JSON.parse(
  readFileSync(join(FIXTURES, "profile-skills.json"), "utf8"),
) as Profile;

function readJd(number: number): string {
  return readFileSync(join(FIXTURES, "jds", `jd-${number}.txt`), "utf8");
}

class FakeProvider implements LlmProvider {
  readonly name = "fake";
  prompt: string | null = null;
  constructor(private readonly payload: Record<string, unknown>) {}
  async completeJson(prompt: string): Promise<Record<string, unknown>> {
    this.prompt = prompt;
    return this.payload;
  }
}

describe("deterministic JD parsing (fixture parity with python oracle)", () => {
  const expectedRoles: Record<number, string> = {
    1: "Software Developer",
    2: "Full Stack Developers",
    3: "Software Engineer I",
    4: "Product Engineer",
  };

  for (const [number, role] of Object.entries(expectedRoles)) {
    it(`parses jd-${number} into clean JSON with role "${role}"`, async () => {
      const parsed = await parseJobDescription(profile, readJd(Number(number)));
      expect(parsed.version).toBe(1);
      expect(parsed.provider).toBe("deterministic");
      expect(parsed.role_title).toBe(role);
      const hasSkills =
        parsed.must_have_skills.length > 0 ||
        parsed.nice_to_have_skills.length > 0;
      expect(hasSkills).toBe(true);
      expect(parsed.key_responsibilities.length).toBeGreaterThan(0);
      for (const skill of [
        ...parsed.must_have_skills,
        ...parsed.nice_to_have_skills,
      ]) {
        expect(Object.keys(skill).sort()).toEqual([
          "id",
          "matched_term",
          "name",
        ]);
      }
    });
  }

  it("normalizes known aliases to canonical skills", async () => {
    const parsed = await parseJobDescription(profile, readJd(1));
    const names = new Set(
      [...parsed.must_have_skills, ...parsed.nice_to_have_skills].map(
        (row) => row.name,
      ),
    );
    expect(names.has("Node.js")).toBe(true);
    expect(names.has("React.js")).toBe(true);
    expect(names.has("Express.js")).toBe(true);
    expect(names.has("JavaScript")).toBe(true);
  });

  it("keeps unknown skills and reports them", async () => {
    const parsed = await parseJobDescription(profile, readJd(1));
    const unknown = new Set(parsed.unknown_skills.map((row) => row.name));
    expect(unknown.has("MySQL")).toBe(true);
    const known = new Set(
      [...parsed.must_have_skills, ...parsed.nice_to_have_skills].map(
        (row) => row.name,
      ),
    );
    // RESTful APIs is a reviewed alias of REST APIs → normalized, not unknown.
    expect(known.has("REST APIs")).toBe(true);

    const explicit = await parseJobDescription(
      profile,
      "Required: Java, JavaScript, MySQL. Nice to have: Kubernetes.",
      { targetTitle: "Software Engineer" },
    );
    const explicitUnknown = new Set(
      explicit.unknown_skills.map((row) => row.name),
    );
    expect(explicitUnknown.has("Java")).toBe(true);
    expect(explicitUnknown.has("Kubernetes")).toBe(true);
  });

  it("throws when the role title cannot be determined", () => {
    expect(() => parseJobDescription(profile, "We write software.")).toThrow(
      "Could not determine role title",
    );
  });

  it("throws on an empty job description", () => {
    expect(() => parseJobDescription(profile, "   ")).toThrow(
      "Job description must not be empty",
    );
  });
});

describe("LLM-provider parsing path", () => {
  it("normalizes provider output and unknowns survive", async () => {
    const provider = new FakeProvider({
      role_title: "Backend Engineer",
      seniority: "junior",
      must_have_skills: ["Node", "Postgres", "Kubernetes"],
      nice_to_have_skills: ["React"],
      keywords: ["APIs", "Kubernetes"],
      key_responsibilities: ["Build APIs"],
    });
    const parsed = await parseJobDescription(
      profile,
      "Use Node, Postgres, React, and Kubernetes.",
      { provider, targetTitle: "Backend Engineer" },
    );
    expect(parsed.provider).toBe("fake");
    expect(parsed.must_have_skills.map((row) => row.name)).toEqual([
      "Node.js",
      "PostgreSQL",
    ]);
    expect(parsed.nice_to_have_skills.map((row) => row.name)).toEqual([
      "React.js",
    ]);
    expect(parsed.unknown_skills.map((row) => row.name)).toEqual([
      "Kubernetes",
    ]);
    expect(provider.prompt).toContain("alias table");
    expect(provider.prompt).toContain("Kubernetes");
  });

  it("falls back to deterministic with the provider error recorded", async () => {
    class BrokenProvider implements LlmProvider {
      readonly name = "broken";
      async completeJson(): Promise<Record<string, unknown>> {
        throw new Error("boom: network down");
      }
    }
    const provider = new BrokenProvider();
    const parsed = await parseJobDescription(profile, readJd(1), { provider });
    expect(parsed.provider).toBe("deterministic");
    expect(parsed.provider_requested).toBe("broken");
    expect(parsed.provider_fallback_error).toContain("boom");
    expect(parsed.role_title).toBe("Software Developer");
  });
});
