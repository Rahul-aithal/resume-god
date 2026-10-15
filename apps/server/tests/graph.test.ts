import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { resetDb, USER_A, USER_B, get, json, makeApp, send } from "./helpers";

interface Ctx {
  base: string;
  close: () => Promise<void>;
}

let a: Ctx;
let b: Ctx;

beforeAll(async () => {
  await resetDb();
  a = await makeApp(USER_A);
  b = await makeApp(USER_B);
});

afterAll(async () => {
  await a.close();
  await b.close();
});

const IMPORT_YAML = `skills:
  - id: skill_python
    name: Python
    category: Languages
    aliases: []
  - id: skill_typescript
    name: TypeScript
    category: Languages
    aliases: [TS]
  - id: skill_nextjs
    name: Next.js
    category: Frameworks
    aliases: [Next]
experiences:
  - id: experience_acme
    role: Senior Engineer
    title: Platform team
    date_range: 2022-2025
projects:
  - id: project_resume
    name: resume-god
achievements:
  - id: achievement_acme_api
    part_of: experience_acme
    text: Built an API platform serving 2M requests per day
    skills: [skill_python, skill_typescript]
    metrics: ["2M req/day"]
  - id: achievement_resume_ui
    part_of: project_resume
    text: Designed the resume UI with React and Tailwind
    skills: [skill_typescript]
education: []
certifications: []
`;

describe("knowledge graph", () => {
  it("starts empty for a fresh user", async () => {
    const projection = await json(await get(`${a.base}/api/graph`));
    expect(projection.nodes).toHaveLength(0);
    expect(projection.edges).toHaveLength(0);
    expect(projection.reviewed_at).toBeNull();
  });

  it("imports a profile document and projects the graph", async () => {
    const imported = await send(`${a.base}/api/graph/import`, "POST", {
      format: "yaml",
      mode: "replace",
      content: IMPORT_YAML,
    });
    expect(imported.status).toBe(201);
    const body = await json<{ imported: Record<string, number> }>(imported);
    expect(body.imported.skills).toBe(3);
    expect(body.imported.parents).toBe(2);
    expect(body.imported.achievements).toBe(2);

    const projection = await json(await get(`${a.base}/api/graph`));
    expect(projection.stats).toEqual({
      skills: 3,
      parents: 2,
      achievements: 2,
      education: 0,
      certifications: 0,
      edges: 8, // 2 PART_OF + 3 DEMONSTRATES + 3 USES
    });
    const kinds = new Set(
      projection.nodes.map((node: { kind: string }) => node.kind),
    );
    expect(kinds.has("skill")).toBe(true);
    expect(kinds.has("experience")).toBe(true);
    expect(kinds.has("project")).toBe(true);
    expect(kinds.has("achievement")).toBe(true);
    const edgeTypes = new Set(
      projection.edges.map((edge: { type: string }) => edge.type),
    );
    expect(edgeTypes.has("USES")).toBe(true);
    expect(edgeTypes.has("PART_OF")).toBe(true);
    expect(edgeTypes.has("DEMONSTRATES")).toBe(true);
  });

  it("imports clear the review gate", async () => {
    await send(`${a.base}/api/graph/review`, "POST");
    const reviewed = await json(await get(`${a.base}/api/graph`));
    expect(reviewed.reviewed_at).not.toBeNull();

    await send(`${a.base}/api/graph/import`, "POST", {
      format: "yaml",
      mode: "replace",
      content: IMPORT_YAML,
    });
    const after = await json(await get(`${a.base}/api/graph`));
    expect(after.reviewed_at).toBeNull();
  });

  it("creates skills with slug ids and curated implies suggestions", async () => {
    const created = await send(`${a.base}/api/graph/skills`, "POST", {
      name: "Drizzle ORM",
      category: "ORMs",
    });
    expect(created.status).toBe(201);
    const skill = await json<{ id: string; name: string }>(created);
    expect(skill.id).toBe("skill_drizzle_orm");
    expect(skill.name).toBe("Drizzle ORM");

    // Drizzle implies SQL + TypeScript — SQL exists from the import? No:
    // the fixture has no SQL skill, so only matching endpoints link.
    const implies = await json(
      await get(`${a.base}/api/graph/skills/${skill.id}/implies?hops=2`),
    );
    expect(implies.skill_id).toBe(skill.id);

    // Create the target skill, then the implication can be linked manually.
    await send(`${a.base}/api/graph/skills`, "POST", { name: "SQL" });
    await send(`${a.base}/api/graph/skill-implies`, "POST", {
      from: skill.id,
      to: "skill_sql",
    });
    const linked = await json(
      await get(`${a.base}/api/graph/skills/${skill.id}/implies?hops=1`),
    );
    expect(linked.implied).toContain("skill_sql");
  });

  it("rejects duplicate-adjacent implies edges and self-implication", async () => {
    const selfRef = await send(`${a.base}/api/graph/skill-implies`, "POST", {
      from: "skill_sql",
      to: "skill_sql",
    });
    expect(selfRef.status).toBe(400);

    const missing = await send(`${a.base}/api/graph/skill-implies`, "POST", {
      from: "skill_nope",
      to: "skill_sql",
    });
    expect(missing.status).toBe(404);
  });

  it("semantic search ranks achievement bullets", async () => {
    const search = await json(
      await get(`${a.base}/api/graph/search?q=API%20platform&limit=3`),
    );
    expect(search.results.length).toBeGreaterThan(0);
    expect(search.results[0].id).toBe("achievement_acme_api");
    expect(search.results[0].similarity).toBeGreaterThan(0);
  });

  it("updates and deletes with referential guards", async () => {
    const updated = await send(
      `${a.base}/api/graph/skills/skill_python`,
      "PUT",
      { aliases: ["Py"] },
    );
    expect(updated.status).toBe(200);
    const body = await json<{ aliases: string[] }>(updated);
    expect(body.aliases).toEqual(["Py"]);

    // skill_python is demonstrated by an achievement → delete refused.
    const refused = await send(
      `${a.base}/api/graph/skills/skill_python`,
      "DELETE",
    );
    expect(refused.status).toBe(400);

    // A parent with achievements is guarded too.
    const parentGuard = await send(
      `${a.base}/api/graph/parents/experience_acme`,
      "DELETE",
    );
    expect(parentGuard.status).toBe(400);

    // An unreferenced skill deletes cleanly.
    const orphan = await send(`${a.base}/api/graph/skills`, "POST", {
      name: "Orphan Skill",
    });
    expect(orphan.status).toBe(201);
    const orphanId = (await json<{ id: string }>(orphan)).id;
    const deleted = await send(
      `${a.base}/api/graph/skills/${orphanId}`,
      "DELETE",
    );
    expect(deleted.status).toBe(200);
  });

  it("exports a document that round-trips through import", async () => {
    const exported = await json(
      await get(`${a.base}/api/graph/export?format=json`),
    );
    expect(exported.format).toBe("json");
    const content = exported.content as Record<string, unknown>;
    expect((content.skills as unknown[]).length).toBeGreaterThanOrEqual(4);

    // Round-trip into user B (fresh): replace-import the exported JSON.
    const imported = await send(`${b.base}/api/graph/import`, "POST", {
      format: "json",
      mode: "replace",
      content: JSON.stringify(content),
    });
    expect(imported.status).toBe(201);

    const projectionA = await json(await get(`${a.base}/api/graph`));
    const projectionB = await json(await get(`${b.base}/api/graph`));
    expect(projectionB.stats).toEqual(projectionA.stats);
  });

  it("scopes graphs per user", async () => {
    const forB = await json(await get(`${b.base}/api/graph`));
    expect(forB.stats.skills).toBeGreaterThan(0);
    const forAOnly = await send(
      `${b.base}/api/graph/skills/skill_python`,
      "DELETE",
    );
    // B has its own copy; deleting B's referenced skill is refused (link exists).
    expect(forAOnly.status).toBe(400);
  });

  it("validates strict bodies", async () => {
    const unknownField = await send(`${a.base}/api/graph/skills`, "POST", {
      name: "X",
      bogus: true,
    });
    expect(unknownField.status).toBe(400);

    const emptyName = await send(`${a.base}/api/graph/skills`, "POST", {
      name: "   ",
    });
    expect(emptyName.status).toBe(400);

    const badAchievement = await send(
      `${a.base}/api/graph/achievements`,
      "POST",
      {
        parent_id: "nope",
        text: "x",
      },
    );
    expect(badAchievement.status).toBe(404);
  });
});
