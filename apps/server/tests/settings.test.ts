import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  resetDb,
  USER_A,
  firstMessage,
  get,
  json,
  makeApp,
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

afterAll(async () => {
  await close();
});

describe("health", () => {
  it("returns ok without auth", async () => {
    const response = await get(`${base}/api/health`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toEqual({ status: "ok" });
  });
});

describe("settings", () => {
  it("returns defaults on fresh db", async () => {
    const response = await get(`${base}/api/settings`);
    expect(response.status).toBe(200);
    const settings = await json(response);
    expect(settings.llm_order).toBe("gemini,glm,openai");
    expect(settings.openai_model).toBe("gpt-4.1");
    expect(settings.default_font).toBe("Calibri");
  });

  it("roundtrips updates and validates llm_order", async () => {
    const saved = await send(`${base}/api/settings`, "PUT", {
      llm_order: "openai,glm",
      openai_model: "gpt-4.1-mini",
      default_font: "Helvetica",
    });
    expect(saved.status).toBe(200);
    const savedBody = await json(saved);
    expect(savedBody.llm_order).toBe("openai,glm");
    expect(savedBody.openai_model).toBe("gpt-4.1-mini");
    expect(savedBody.default_font).toBe("Helvetica");

    const providers = await json(await get(`${base}/api/providers`));
    expect(providers.order).toEqual(["openai", "glm"]);
    expect(providers.models.openai).toBe("gpt-4.1-mini");

    const bad = await send(`${base}/api/settings`, "PUT", {
      llm_order: "gpt4,glm",
    });
    expect(bad.status).toBe(400);
    expect(firstMessage(await json(bad))).toContain(
      "llm_order: unknown providers",
    );

    const empty = await send(`${base}/api/settings`, "PUT", {
      llm_order: ",,",
    });
    expect(empty.status).toBe(400);
    expect(firstMessage(await json(empty))).toBe("llm_order: cannot be empty");
  });
});

describe("providers status", () => {
  it("reports deterministic auto when no keys exist at boot", async () => {
    // Config is validated at bootstrap: the key-less state must exist
    // BEFORE the module is created, so boot a dedicated app for this.
    const savedEnv: Record<string, string | undefined> = {};
    for (const key of [
      "GEMINI_API_KEY",
      "GOOGLE_API_KEY",
      "GLM_API_KEY",
      "ZAI_API_KEY",
      "Z_AI_API_KEY",
      "ZHIPU_API_KEY",
      "OPENAI_API_KEY",
      "RESUME_GOD_LLM_ORDER",
    ]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    try {
      const app = await makeApp(USER_A);
      const providers = await json(await get(`${app.base}/api/providers`));
      expect(providers.auto).toBe("deterministic (auto — no keys found)");
      await app.close();
    } finally {
      for (const [key, value] of Object.entries(savedEnv)) {
        if (value !== undefined) process.env[key] = value;
        else delete process.env[key];
      }
    }
  });
});
