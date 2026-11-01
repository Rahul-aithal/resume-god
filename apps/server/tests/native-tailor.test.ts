import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { resetDb, USER_A, get, json, makeApp, send } from "./helpers";

let base: string;
let close: () => Promise<void>;

const IMPORT_YAML = `skills:
  - id: skill_typescript
    name: TypeScript
    category: Languages
    aliases: [TS]
  - id: skill_javascript
    name: JavaScript
    category: Languages
    aliases: [JS]
  - id: skill_react_js
    name: React.js
    category: Frontend
    aliases: [React]
experiences:
  - id: experience_xparth
    role: Frontend Developer Intern
    title: XParth Technologies
    date_range: 2026-2026
projects: []
achievements:
  - id: achievement_xparth_ui
    part_of: experience_xparth
    text: Building production frontend interfaces using TypeScript and React.js for an internal admin platform.
    skills: [skill_typescript, skill_react_js]
    metrics: ["10 pages"]
education: []
certifications: []
`;

beforeAll(async () => {
  await resetDb();
  const app = await makeApp(USER_A);
  base = app.base;
  close = app.close;

  await send(`${base}/api/graph/import`, "POST", {
    format: "yaml",
    mode: "replace",
    content: IMPORT_YAML,
  });
});

afterAll(async () => {
  await close();
});

describe("native tailor → render flow", () => {
  it("tailors a plan and resume-data without any LLM (deterministic)", async () => {
    const tailor = await send(`${base}/api/tailor`, "POST", {
      jd_text:
        "Software Developer\nWe need a developer with TypeScript and React.js experience to build admin interfaces.",
      max_achievements: 3,
    });
    expect(tailor.status).toBe(201);
    const body = await json<{
      plan: Record<string, unknown>;
      resume_data: Record<string, unknown>;
      validation: { issues: string[] };
      providers: Record<string, { requested: string; used: string }>;
    }>(tailor);

    expect(body.providers.parsing.used).toBe("deterministic");
    expect(body.providers.rewriting.used).toBe("deterministic");

    const plan = body.plan as {
      target_title: string;
      matched_skills: Array<{ name: string }>;
      selected_achievements: Array<{ id: string }>;
      audit: Record<string, boolean>;
    };
    expect(plan.target_title).toBe("Software Developer");
    const matched = plan.matched_skills.map((skill) => skill.name);
    expect(matched).toContain("TypeScript");
    expect(plan.selected_achievements).toHaveLength(1);
    expect(Object.values(plan.audit).every(Boolean)).toBe(true);

    const resumeData = body.resume_data as {
      version: number;
      summary: string;
      contact: { name: string; email: string };
      sections: Array<{
        kind: string;
        bullets: string[];
        tech_stack?: string;
      }>;
      skills: Array<{ category: string; names: string[] }>;
    };
    expect(resumeData.version).toBe(1);
    expect(resumeData.contact.name).toBe(USER_A.display_name);
    expect(resumeData.contact.email).toBe(USER_A.email);
    expect(resumeData.sections).toHaveLength(1);
    expect(resumeData.sections[0].bullets[0]).toContain("production frontend");
    expect(resumeData.sections[0].tech_stack).toBeUndefined(); // experiences have no stack line
    expect(resumeData.skills.length).toBeGreaterThan(0);
    expect(body.validation.issues).toHaveLength(0);
  });

  it("honors an explicit target title even when the JD heading differs (python parity)", async () => {
    const tailor = await send(`${base}/api/tailor`, "POST", {
      jd_text: "Software Developer\nTypeScript and React.js role.",
      target_title: "Data Scientist",
    });
    expect(tailor.status).toBe(201);
    const body = await json<{ plan: { target_title: string } }>(tailor);
    expect(body.plan.target_title).toBe("Data Scientist");
  });

  it("renders resume.pdf via Typst from resume-data", async () => {
    // Typst binary ships in the python venv of this repo.
    const tailor = await send(`${base}/api/tailor`, "POST", {
      jd_text:
        "Software Developer\nWe need a developer with TypeScript and React.js experience.",
    });
    const body = await json<{ resume_data: Record<string, unknown> }>(tailor);

    const response = await send(`${base}/api/render`, "POST", {
      resume_data: body.resume_data,
    });
    if (response.status !== 200) {
      // Typst binary unavailable in this environment → 500 is acceptable
      // as long as it is an explicit render failure, not a crash.
      expect(response.status).toBe(500);
      return;
    }
    expect(response.headers.get("content-type")).toBe("application/pdf");
    const buffer = new Uint8Array(await response.arrayBuffer());
    expect(buffer[0]).toBe(0x25); // %PDF
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("review edits pass grounding and rejected edits fall back", async () => {
    const tailor = await send(`${base}/api/tailor`, "POST", {
      jd_text:
        "Software Developer\nWe need a developer with TypeScript and React.js experience.",
    });
    const body = await json<{
      plan: {
        rewrites: Record<
          string,
          { source_text: string; used_rewrite: boolean }
        >;
      };
    }>(tailor);
    const achievementId = Object.keys(body.plan.rewrites)[0];
    const sourceText = body.plan.rewrites[achievementId].source_text;

    // A cheating edit that introduces a new technology falls back.
    const cheating = await send(`${base}/api/review`, "POST", {
      plan: body.plan,
      edits: {
        rewritten_text: {
          [achievementId]: `${sourceText} Built with Kubernetes and Kafka pipelines.`,
        },
      },
    });
    expect(cheating.status).toBe(201);
    const cheatBody = await json<{
      rejected_edits: string[];
      plan: { rewrites: Record<string, { used_rewrite: boolean }> };
    }>(cheating);
    expect(cheatBody.rejected_edits).toContain(achievementId);
    expect(cheatBody.plan.rewrites[achievementId].used_rewrite).toBe(false);

    // A safe edit (no new tech/numbers) is kept.
    const safe = await send(`${base}/api/review`, "POST", {
      plan: body.plan,
      edits: {
        rewritten_text: {
          [achievementId]:
            "Building production admin-platform interfaces with React.js and TypeScript.",
        },
      },
    });
    const safeBody = await json<{
      rejected_edits: string[];
      plan: { rewrites: Record<string, { used_rewrite: boolean }> };
    }>(safe);
    expect(safeBody.rejected_edits).toHaveLength(0);
    expect(safeBody.plan.rewrites[achievementId].used_rewrite).toBe(true);
  });
});
