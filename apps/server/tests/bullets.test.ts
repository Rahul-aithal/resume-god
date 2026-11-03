import { describe, expect, it } from "bun:test";

import {
  groundedText,
  rewritePlan,
  rewritePrompt,
  validateRewrite,
} from "../src/pipeline/rewrite";
import { selectForResume } from "../src/pipeline/tailor";

const profile = {
  skills: [
    { id: "s_ts", name: "TypeScript" },
    { id: "s_cicd", name: "CI/CD" },
    { id: "s_go", name: "Go" },
  ],
};
const check = (
  source: string,
  rewrite: string,
  extra: { metrics?: string[]; skills?: string[] } = {},
) => validateRewrite(source, rewrite, { part_of: "p", ...extra }, profile);

describe("what a bullet may claim", () => {
  it("allows numbers from the bullet's metrics", () => {
    const source = "Set up CI and shipped versioned releases.";
    const rewrite = "Shipped 8 tagged releases through CI";
    expect(check(source, rewrite).passed).toBe(false);
    expect(
      check(source, rewrite, { metrics: ["8 tagged releases"] }).passed,
    ).toBe(true);
  });

  it("treats a spelled-out number and its digits as the same claim", () => {
    expect(check("Ran four stages.", "Ran 4 stages").passed).toBe(true);
    expect(check("Ran four stages.", "Ran 5 stages").passed).toBe(false);
  });

  it.each(["Served 5M users", "Served 10k users", "Served 1,000 users"])(
    "rejects an invented amount: %s",
    (rewrite) => {
      expect(check("Served users.", rewrite).passed).toBe(false);
    },
  );

  it("rejects invented scale words", () => {
    expect(check("Served users.", "Served thousands of users").passed).toBe(
      false,
    );
  });

  it("rejects invented names, like working in an Agile team", () => {
    const verdict = check(
      "Deployed on EC2 with a senior engineer.",
      "Deployed on EC2 with a senior engineer in an Agile environment",
    );
    expect(verdict.issues.join()).toContain("Agile");
  });

  it("isn't thrown by the full stop after a technology", () => {
    const verdict = check(
      "Styled pages using Tailwind CSS.",
      "Styled pages with CSS through Tailwind",
    );
    expect(verdict.issues.join()).not.toContain("css");
  });

  it("lets a bullet name a skill linked to it", () => {
    const source = "Set up GitHub Actions.";
    const rewrite = "Automated CI/CD with GitHub Actions";
    expect(check(source, rewrite).passed).toBe(false);
    expect(check(source, rewrite, { skills: ["s_cicd"] }).passed).toBe(true);
  });

  it("allows a source to become two bullets, not many", () => {
    const source = "Built a pipeline and exposed it through an endpoint.";
    expect(check(source, "Built a pipeline\nExposed an endpoint").passed).toBe(
      true,
    );
    expect(check(source, "Built\nExposed\nRan\nShipped").passed).toBe(false);
  });
});

describe("a bullet with no rewrite", () => {
  it("still shows its metric", () => {
    expect(groundedText("Set up CI.", ["8 tagged releases"])).toBe(
      "Set up CI; 8 tagged releases.",
    );
  });

  it("doesn't repeat a number it already states", () => {
    expect(groundedText("Shipped 8 releases.", ["8 releases"])).toBe(
      "Shipped 8 releases.",
    );
  });

  it("makes a paragraph into one line per sentence", () => {
    expect(groundedText("Built a pipeline. Learned from a spec.")).toBe(
      "Built a pipeline.\nLearned from a spec.",
    );
  });
});

describe("the rewrite prompt", () => {
  const prompt = rewritePrompt({ target_title: "SDE" }, [
    {
      id: "a",
      text: "Set up CI.",
      metrics: ["8 releases"],
      linked_skills: ["Go"],
    },
  ]);

  it("gives the model the metrics and linked skills", () => {
    expect(prompt).toContain("8 releases");
    expect(prompt).toContain("Go");
  });

  it("asks for numbers without allowing any to be invented", () => {
    expect(prompt).toContain("Leads with numbers");
    expect(prompt).toContain("Never invent a number");
  });
});

describe("rewritePlan", () => {
  const plan = {
    target_title: "SDE",
    audit: { ok: true },
    ranking: [{ achievement_id: "a" }, { achievement_id: "b" }],
    selected_parents: [
      { kind: "project", id: "p", achievement_ids: ["a", "b"] },
    ],
  };
  const fullProfile = {
    ...profile,
    achievements: [
      { id: "a", part_of: "p", text: "Set up CI.", metrics: ["8 releases"] },
      { id: "b", part_of: "p", text: "Ran four stages.", metrics: [] },
    ],
    projects: [{ id: "p", name: "Vaultr" }],
  };
  const provider = (response: Record<string, unknown>) => ({
    name: "stub",
    completeJson: () => Promise.resolve(response),
  });
  type Rewritten = {
    rewrites: Record<string, { rewritten_text: string; status: string }>;
    generated_summary?: string;
  };

  it("keeps several bullets for one source, and a grounded summary", async () => {
    const done = (await rewritePlan(
      plan,
      fullProfile,
      provider({
        summary: "SDE who shipped Vaultr.",
        rewrites: [
          { achievement_id: "a", bullets: ["Shipped 8 releases", "Set up CI"] },
        ],
      }),
    )) as unknown as Rewritten;
    expect(done.rewrites.a.rewritten_text).toBe(
      "Shipped 8 releases\nSet up CI",
    );
    expect(done.generated_summary).toBe("SDE who shipped Vaultr.");
  });

  it("puts back a metric the rewrite left out", async () => {
    const done = (await rewritePlan(
      plan,
      fullProfile,
      provider({ rewrites: [{ achievement_id: "a", bullets: ["Set up CI"] }] }),
    )) as unknown as Rewritten;
    expect(done.rewrites.a.status).toBe("used");
    expect(done.rewrites.a.rewritten_text).toBe("Set up CI; 8 releases.");
  });

  it("rejects a rewrite that loses a number from the source", async () => {
    const done = (await rewritePlan(
      plan,
      fullProfile,
      provider({
        rewrites: [{ achievement_id: "b", bullets: ["Ran stages"] }],
      }),
    )) as unknown as Rewritten;
    expect(done.rewrites.b.status).toBe("fallback_original");
    expect(done.rewrites.b.rewritten_text).toBe("Ran four stages.");
  });

  it("drops a summary with an invented claim, and falls back with metrics", async () => {
    const done = (await rewritePlan(
      plan,
      fullProfile,
      provider({
        summary: "SDE with 9 years of experience.",
        rewrites: [{ achievement_id: "a", bullets: ["Shipped 99 releases"] }],
      }),
    )) as unknown as Rewritten;
    expect(done.generated_summary).toBeUndefined();
    expect(done.rewrites.a.status).toBe("fallback_original");
    expect(done.rewrites.a.rewritten_text).toBe("Set up CI; 8 releases.");
  });
});

describe("selectForResume", () => {
  const row = (
    id: string,
    parent: string,
    score: number,
    skills: string[] = [],
  ) =>
    ({
      achievement: { id, part_of: parent },
      score,
      position: 0,
      direct_skill_matches: skills,
      requirement_skill_matches: skills,
      inferred_skill_matches: [],
    }) as never;
  const ids = (rows: unknown[]) =>
    (rows as Array<{ achievement: { id: string } }>).map(
      (item) => item.achievement.id,
    );

  it("gives internships and projects several bullets, not one each", () => {
    const ranked = [
      row("p1a", "p1", 9),
      row("p1b", "p1", 8),
      row("p2a", "p2", 7),
      row("p2b", "p2", 6),
      row("e1a", "e1", 5),
      row("e1b", "e1", 4),
      row("e1c", "e1", 3),
      row("e1d", "e1", 2),
    ];
    const chosen = ids(
      selectForResume(ranked, {
        maxAchievements: 7,
        experienceIds: new Set(["e1"]),
      }),
    );
    expect(chosen.slice(0, 3)).toEqual(["e1a", "e1b", "e1c"]);
    expect(chosen).toContain("p1b");
    expect(chosen).toContain("p2b");
  });

  it("limits projects unless one adds a skill nothing else shows", () => {
    const ranked = ["a", "b", "c", "d", "e"].map((id, index) =>
      row(`${id}1`, id, 10 - index),
    );
    ranked.push(row("f1", "f", 1, ["s_rare"]));
    const chosen = ids(
      selectForResume(ranked, {
        maxAchievements: 20,
        experienceIds: new Set(),
      }),
    );
    expect(chosen).toContain("f1");
    expect(chosen).not.toContain("e1");
  });

  it("never passes the limit", () => {
    const ranked = [row("a", "e", 3), row("b", "e", 2), row("c", "p", 1)];
    expect(
      selectForResume(ranked, {
        maxAchievements: 2,
        experienceIds: new Set(["e"]),
      }),
    ).toHaveLength(2);
  });
});
