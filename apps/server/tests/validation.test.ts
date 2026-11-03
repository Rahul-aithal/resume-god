import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  USER_A,
  firstMessage,
  get,
  json,
  makeApp,
  resetDb,
  send,
} from "./helpers";

let base: string;
let close: () => Promise<void>;

beforeAll(async () => {
  await resetDb();
  const app = await makeApp(USER_A);
  base = app.base;
  close = app.close;
});

afterAll(() => close());

async function expect400(response: Response, message: string) {
  expect(response.status).toBe(400);
  expect(firstMessage(await json(response))).toContain(message);
}

describe("request DTOs", () => {
  it("rejects unknown fields", async () => {
    await expect400(
      await send(`${base}/api/companies`, "POST", { name: "A", admin: true }),
      "admin",
    );
  });

  it("rejects null, rather than failing on a NOT NULL column", async () => {
    await expect400(
      await send(`${base}/api/companies`, "POST", { name: "A", notes: null }),
      "notes:",
    );
    await expect400(
      await send(`${base}/api/graph/skills`, "POST", {
        name: "TS",
        category: null,
      }),
      "category:",
    );
  });

  it("trims text before checking it", async () => {
    const company = await json<{ name: string }>(
      await send(`${base}/api/companies`, "POST", { name: "  Acme  " }),
    );
    expect(company.name).toBe("Acme");
  });

  it("converts query strings and applies defaults", async () => {
    expect((await get(`${base}/api/roles?limit=5&offset=0`)).status).toBe(200);
    expect((await get(`${base}/api/roles`)).status).toBe(200);
    expect((await get(`${base}/api/graph/search?q=anything`)).status).toBe(200);
    await expect400(await get(`${base}/api/roles?limit=abc`), "limit:");
    await expect400(await get(`${base}/api/roles?limit=501`), "limit:");
  });

  it("checks route params", async () => {
    await expect400(await get(`${base}/api/roles/abc/history`), "roleId:");
    await expect400(await get(`${base}/api/companies/0`), "companyId:");
    await expect400(
      await send(`${base}/api/settings/api-keys/anthropic`, "PUT", {
        api_key: "sk-long-enough",
      }),
      "Unknown provider",
    );
  });

  it("validates nested objects and reports their full path", async () => {
    await expect400(
      await send(`${base}/api/review`, "POST", {
        plan: {},
        edits: { rewritten_text: "not an object" },
      }),
      "edits.rewritten_text:",
    );
  });

  it("allows a free-form plan and resume through unchanged", async () => {
    const response = await send(`${base}/api/render`, "POST", {
      resume_data: "not an object",
    });
    await expect400(response, "resume_data:");
  });

  it("reports every problem at once", async () => {
    const response = await send(`${base}/api/graph/skills`, "POST", {
      id: "Not Valid",
      name: " ",
    });
    expect(response.status).toBe(400);
    const { message } = await json<{ message: string[] }>(response);
    expect(message.some((item) => item.startsWith("id:"))).toBe(true);
    expect(
      message.some((item) => item.includes("Skill name is required")),
    ).toBe(true);
  });
});

describe("imported profile documents", () => {
  const importing = (content: unknown, format: "json" | "yaml" = "json") =>
    send(`${base}/api/graph/import`, "POST", {
      format,
      mode: "merge",
      content: format === "json" ? JSON.stringify(content) : content,
    });
  const sections = {
    skills: [],
    experiences: [],
    projects: [],
    achievements: [],
  };

  it("names each missing section", async () => {
    await expect400(await importing({ skills: [] }), "experiences:");
  });

  it("points at the exact bad row", async () => {
    await expect400(
      await importing({
        ...sections,
        skills: [{ id: "s1", name: "A" }, { id: "s2" }],
      }),
      "skills.1.name:",
    );
  });

  it("requires a role or name on experiences", async () => {
    await expect400(
      await importing({ ...sections, experiences: [{ id: "e1" }] }),
      "either role or name",
    );
  });

  it("rejects an achievement whose part_of doesn't exist", async () => {
    await expect400(
      await importing({
        ...sections,
        achievements: [{ id: "a1", part_of: "nope", text: "Did it" }],
      }),
      "part_of must match",
    );
  });

  it("keeps YAML numbers and blanks rather than failing on them", async () => {
    const response = await importing(
      `skills: []
experiences:
  - id: exp_years
    role: Engineer
    date_range: 2024
    url:
projects: []
achievements: []
version: 2
`,
      "yaml",
    );
    expect(response.status).toBe(201);
    const { content } = await json<{
      content: { experiences: Array<{ id: string; date_range?: string }> };
    }>(await get(`${base}/api/graph/export?format=json`));
    const parent = content.experiences.find((row) => row.id === "exp_years")!;
    expect(parent.date_range).toBe("2024");
  });

  it("doesn't wipe the graph when a replace import is invalid", async () => {
    await importing({
      ...sections,
      skills: [{ id: "keep_me", name: "Keep" }],
    });
    const response = await send(`${base}/api/graph/import`, "POST", {
      format: "json",
      mode: "replace",
      content: JSON.stringify({ ...sections, skills: [{ id: "broken" }] }),
    });
    expect(response.status).toBe(400);
    expect((await get(`${base}/api/graph/skills/keep_me`)).status).toBe(200);
  });
});
