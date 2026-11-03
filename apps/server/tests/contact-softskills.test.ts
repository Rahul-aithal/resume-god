import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { resetDb, USER_A, get, json, makeApp, send } from "./helpers";

let base: string;
let close: () => Promise<void>;

beforeAll(async () => {
  await resetDb();
  const app = await makeApp(USER_A);
  base = app.base;
  close = app.close;
});

afterAll(async () => {
  await close();
});

describe("contact fallback + soft skills + docx export", () => {
  it("falls back to auth account when no contact row exists", async () => {
    const contact = await json(await get(`${base}/api/graph/contact`));
    expect(contact.name).toBe(USER_A.display_name);
    expect(contact.email).toBe(USER_A.email);
    expect(contact.source).toBe("account");
  });

  it("upserts contact and profile values win", async () => {
    const saved = await send(`${base}/api/graph/contact`, "PUT", {
      location: "Bengaluru, KA",
      phone: "+91-90000",
      email: "kg@example.com",
      linkedin: "linkedin.com/in/x",
      github: "Rahul-aithal",
      personal_site: "example.site",
    });
    expect(saved.status).toBe(200);

    const contact = await json(await get(`${base}/api/graph/contact`));
    expect(contact.source).toBe("profile");
    expect(contact.location).toBe("Bengaluru, KA");
    expect(contact.email).toBe("kg@example.com");
    expect(contact.name).toBe(USER_A.display_name); // still from account
  });

  it("validates contact email", async () => {
    const bad = await send(`${base}/api/graph/contact`, "PUT", {
      email: "not-an-email",
    });
    expect(bad.status).toBe(400);
  });

  it("manages soft skills", async () => {
    const created = await send(`${base}/api/graph/soft-skills`, "POST", {
      name: "Fast Learner",
      detail: "Adopted Go mid-project",
    });
    expect(created.status).toBe(201);
    const skill = await json<{ id: string }>(created);
    expect(skill.id).toBe("softskill_fast_learner");

    const updated = await send(
      `${base}/api/graph/soft-skills/${skill.id}`,
      "PUT",
      { detail: "Adopted Go and HLS streaming mid-project" },
    );
    expect(updated.status).toBe(200);
    expect((await json(updated)).detail).toContain("HLS");

    const list = await json(await get(`${base}/api/graph/soft-skills`));
    expect(list).toHaveLength(1);

    const deleted = await send(
      `${base}/api/graph/soft-skills/${skill.id}`,
      "DELETE",
    );
    expect(deleted.status).toBe(200);

    const missing = await send(
      `${base}/api/graph/soft-skills/${skill.id}`,
      "PUT",
      { name: "x" },
    );
    expect(missing.status).toBe(404);
  });

  it("downloads a tailored resume as Word, with its own bullets", async () => {
    const response = await send(`${base}/api/render/docx`, "POST", {
      resume_data: {
        contact: {
          name: "Ada",
          location: "",
          phone: "",
          email: "ada@example.com",
          linkedin: "https://linkedin.com/in/ada",
          github: "ada",
          personal_site: "",
        },
        summary: "Tailored summary",
        skills: [{ category: "Languages", names: ["TypeScript"] }],
        sections: [
          {
            kind: "experience",
            organization: "Acme",
            role: "Intern",
            bullets: ["Shipped 8 releases"],
          },
        ],
        education: [],
        certifications: [],
        soft_skills: [],
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("wordprocessingml");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
  });

  it("exports resume.docx with real content", async () => {
    // Seed minimal graph content first.
    await send(`${base}/api/graph/skills`, "POST", {
      name: "TypeScript",
      category: "Languages",
    });
    await send(`${base}/api/graph/parents`, "POST", {
      kind: "experience",
      name: "XParth Technologies",
      title: "Frontend Developer Intern",
    });
    await send(`${base}/api/graph/achievements`, "POST", {
      parent_id: "experience_xparth_technologies",
      text: "Built production admin interfaces",
      skills: ["skill_typescript"],
    });
    await send(`${base}/api/graph/soft-skills`, "POST", {
      name: "Code Quality Focused",
      detail: "Writes unit tests",
    });

    const docx = await get(`${base}/api/render/docx`);
    expect(docx.status).toBe(200);
    expect(docx.headers.get("content-type")).toContain("wordprocessingml");
    const buffer = new Uint8Array(await docx.arrayBuffer());
    // OOXML zip magic: PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(2000);
  });
});
