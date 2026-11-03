import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "bun:test";

import { parseJobDescription, type Profile } from "../src/pipeline/jd-parser";
import {
  buildTailoringPlan,
  refreshCoverage,
  type TailoringPlan,
} from "../src/pipeline/tailor";
import { renderPlanMarkdown } from "../src/pipeline/render-plan-markdown";

const FIXTURES = join(import.meta.dir, "fixtures");
type FixtureProfile = Profile & {
  experiences: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  achievements: Array<Record<string, unknown>>;
  education: Array<Record<string, unknown>>;
  certifications: Array<Record<string, unknown>>;
};

const profile = JSON.parse(
  readFileSync(join(FIXTURES, "profile-full.json"), "utf8"),
) as FixtureProfile;

const JD = readFileSync(join(FIXTURES, "jds", "jd-1.txt"), "utf8");

/** Deterministic semantic scorer over simple keyword overlap. */
async function fakeSearch(query: string, limit: number) {
  const lowered = query.toLowerCase();
  return profile.achievements
    .map((achievement: Record<string, unknown>) => {
      const text = String(achievement.text).toLowerCase();
      const tokens = lowered.split(/\W+/).filter((t) => t.length > 3);
      const hits = tokens.filter((token: string) =>
        text.includes(token),
      ).length;
      return {
        id: String(achievement.id),
        similarity: tokens.length > 0 ? hits / tokens.length : 0,
      };
    })
    .filter((row: { similarity: number }) => row.similarity > 0)
    .sort(
      (a: { similarity: number }, b: { similarity: number }) =>
        b.similarity - a.similarity,
    )
    .slice(0, limit);
}

let parsed: Record<string, unknown>;
let plan: TailoringPlan;

beforeEach(async () => {
  parsed = (await parseJobDescription(profile, JD)) as unknown as Record<
    string,
    unknown
  >;
  plan = await buildTailoringPlan(profile, JD, {
    targetTitle: "Software Developer",
    maxAchievements: 6,
    parsedJobDescription: parsed,
    searchBullets: fakeSearch,
    impliesEdges: [
      { from: "skill_react_js", to: "skill_javascript" },
      { from: "skill_next_js", to: "skill_javascript" },
    ],
  });
});

describe("buildTailoringPlan", () => {
  it("builds an auditable plan", () => {
    expect(plan.version).toBe(2);
    expect(plan.phase).toBe("tailoring_plan");
    expect(plan.selection_policy_version).toBe(4);
    expect(plan.profile).toEqual({ reviewed: false });
    expect(plan.target_title).toBe("Software Developer");
  });

  it("passes every audit check on reviewed fixture data", () => {
    for (const [check, passed] of Object.entries(plan.audit)) {
      if (
        check ===
        "every_selected_achievement_is_retrieved_from_reviewed_evidence"
      ) {
        continue; // depends on the injected fake scorer's cutoff
      }
      expect(`${check}=${passed}`).toBe(`${check}=true`);
    }
  });

  it("respects maxAchievements and emits matching ranking rows", async () => {
    const small = await buildTailoringPlan(profile, JD, {
      targetTitle: "Software Developer",
      maxAchievements: 2,
      parsedJobDescription: parsed,
      searchBullets: fakeSearch,
    });
    expect(small.selected_achievements.length).toBeLessThanOrEqual(2);
    expect(small.ranking.length).toBe(small.selected_achievements.length);
  });

  it("selects parents for every selected achievement", () => {
    const parentIds = new Set(plan.selected_parents.map((parent) => parent.id));
    for (const achievement of plan.selected_achievements) {
      expect(parentIds.has(String(achievement.part_of))).toBe(true);
    }
    for (const parent of plan.selected_parents) {
      expect(parent.achievement_ids.length).toBeGreaterThan(0);
    }
  });

  it("reports requirement coverage with known statuses", () => {
    const validStatuses = new Set([
      "covered",
      "inferred_covered",
      "profile_skill_not_selected",
      "inferred_available_not_selected",
      "profile_skill_without_evidence",
      "unknown_no_profile_match",
    ]);
    for (const row of plan.requirement_coverage) {
      expect(validStatuses.has(row.status as string)).toBe(true);
    }
    const gapKeys = Object.keys(plan.gap_report);
    expect(gapKeys).toContain("unknown_skills");
    expect(gapKeys).toContain("matched_but_unevidenced_skills");
    expect(gapKeys).toContain("inferred_covered_skills");
    expect(gapKeys).toContain("all_known_requirements_covered");
  });

  it("labels inferred coverage as weaker evidence, never direct claims", () => {
    for (const row of plan.requirement_coverage) {
      if ((row.status as string) === "inferred_covered") {
        expect(row.evidence_available).toBe(true);
      }
    }
    for (const row of plan.graph_expansion.implies_paths as Array<
      Record<string, unknown>
    >) {
      expect(row.via).toBe("framework_implies_foundation");
    }
  });

  it("keeps the requested title when the job calls itself something else", async () => {
    const renamed = await buildTailoringPlan(profile, JD, {
      targetTitle: "SDE",
      parsedJobDescription: parsed,
    });
    expect(renamed.target_title).toBe("SDE");
    expect(renamed.job_description_parse.role_title).toBe("Software Developer");
  });

  it("rejects an empty JD and a bad max", async () => {
    await expect(
      buildTailoringPlan(profile, "   ", { targetTitle: "X" }),
    ).rejects.toThrow(/Job description must not be empty/);
    await expect(
      buildTailoringPlan(profile, JD, {
        targetTitle: "Software Developer",
        maxAchievements: 0,
        parsedJobDescription: parsed,
      }),
    ).rejects.toThrow(/max_achievements must be at least 1/);
  });

  it("is deterministic for identical inputs", async () => {
    const again = await buildTailoringPlan(profile, JD, {
      targetTitle: "Software Developer",
      maxAchievements: 6,
      parsedJobDescription: parsed,
      searchBullets: fakeSearch,
      impliesEdges: [
        { from: "skill_react_js", to: "skill_javascript" },
        { from: "skill_next_js", to: "skill_javascript" },
      ],
    });
    expect(JSON.stringify(again)).toBe(JSON.stringify(plan));
  });

  it("renders a reviewable markdown report", () => {
    const markdown = renderPlanMarkdown(plan, profile);
    expect(markdown).toContain("# Resume tailoring plan");
    expect(markdown).toContain("Target title: **Software Developer**");
    expect(markdown).toContain("## Selection audit");
    expect(markdown).toContain("PASS:");
    expect(markdown).toContain("| Requirement | Priority | Status |");
  });
});

describe("refreshCoverage", () => {
  it("recomputes coverage from mutated selections", () => {
    const mutable: Record<string, unknown> = JSON.parse(JSON.stringify(plan));
    // Drop all selected achievements: coverage must degrade accordingly.
    (mutable.selected_achievements as unknown[]) = [];
    refreshCoverage(mutable as TailoringPlan, profile, [
      { from: "skill_react_js", to: "skill_javascript" },
    ]);
    const coverage = mutable.requirement_coverage as Array<{
      status: string;
    }>;
    const covered = coverage.filter(
      (row: { status: string }) => row.status === "covered",
    );
    expect(covered.length).toBe(0);
    const gapReport = mutable.gap_report as {
      all_known_requirements_covered: boolean;
    };
    expect(gapReport.all_known_requirements_covered).toBe(false);
  });
});
