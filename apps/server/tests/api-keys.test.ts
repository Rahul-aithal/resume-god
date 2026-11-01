import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { decryptApiKey, encryptApiKey } from "../src/settings/api-key-crypto";
import {
  TEST_DATABASE_URL,
  USER_A,
  USER_B,
  get,
  json,
  makeApp,
  resetDb,
  send,
} from "./helpers";

const SECRET_KEY = "sk-user-owned-key-abcd1234";

interface KeyStatus {
  provider: string;
  source: string;
  last4: string | null;
  needs_reentry: boolean;
}

const statusOf = (body: { keys: KeyStatus[] }, provider: string) =>
  body.keys.find((key) => key.provider === provider)!;

let a: Awaited<ReturnType<typeof makeApp>>;
let b: Awaited<ReturnType<typeof makeApp>>;

beforeAll(async () => {
  for (const name of ["GEMINI_API_KEY", "GOOGLE_API_KEY", "OPENAI_API_KEY"]) {
    process.env[name] = "";
  }
  for (const name of [
    "GLM_API_KEY",
    "ZAI_API_KEY",
    "Z_AI_API_KEY",
    "ZHIPU_API_KEY",
  ]) {
    process.env[name] = "";
  }
  process.env.BETTER_AUTH_SECRET = "test-secret-for-api-key-encryption";
  await resetDb();
  a = await makeApp(USER_A);
  b = await makeApp(USER_B);
});

afterAll(async () => {
  await a.close();
  await b.close();
});

const keysUrl = (base: string, provider = "") =>
  `${base}/api/settings/api-keys${provider ? `/${provider}` : ""}`;

async function storedRows() {
  const { getDb } = await import("../src/db/client");
  const { userApiKeys } = await import("../src/db/schema");
  return getDb(TEST_DATABASE_URL).select().from(userApiKeys);
}

describe("api key crypto", () => {
  it("round-trips, and rejects the wrong secret or owner", () => {
    const blob = encryptApiKey(SECRET_KEY, "secret", "user-1:openai");
    expect(blob).not.toContain(SECRET_KEY);
    expect(decryptApiKey(blob, "secret", "user-1:openai")).toBe(SECRET_KEY);
    expect(decryptApiKey(blob, "rotated", "user-1:openai")).toBeNull();
    expect(decryptApiKey(blob, "secret", "user-2:openai")).toBeNull();
    expect(decryptApiKey("garbage", "secret", "user-1:openai")).toBeNull();
  });
});

describe("api key endpoints", () => {
  it("starts with no keys", async () => {
    const body = await json<{ keys: KeyStatus[] }>(await get(keysUrl(a.base)));
    expect(body.keys.map((key) => key.provider).sort()).toEqual([
      "gemini",
      "glm",
      "openai",
    ]);
    expect(statusOf(body, "openai").source).toBe("none");
  });

  it("stores only ciphertext and never returns the key", async () => {
    const response = await send(keysUrl(a.base, "openai"), "PUT", {
      api_key: SECRET_KEY,
    });
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain(SECRET_KEY);
    const status = statusOf(JSON.parse(raw), "openai");
    expect(status.source).toBe("user");
    expect(status.last4).toBe("1234");

    const listed = await (await get(keysUrl(a.base))).text();
    expect(listed).not.toContain(SECRET_KEY);

    const rows = await storedRows();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(SECRET_KEY);
  });

  it("keeps keys private to each user", async () => {
    const body = await json<{ keys: KeyStatus[] }>(await get(keysUrl(b.base)));
    expect(statusOf(body, "openai").source).toBe("none");
    expect(statusOf(body, "openai").last4).toBeNull();
  });

  it("replaces a saved key instead of duplicating it", async () => {
    await send(keysUrl(a.base, "openai"), "PUT", {
      api_key: "sk-replacement-key-9999",
    });
    const body = await json<{ keys: KeyStatus[] }>(await get(keysUrl(a.base)));
    expect(statusOf(body, "openai").last4).toBe("9999");
    expect(await storedRows()).toHaveLength(1);
  });

  it("flags a key it can no longer decrypt", async () => {
    const { getDb } = await import("../src/db/client");
    const { userApiKeys } = await import("../src/db/schema");
    await getDb(TEST_DATABASE_URL)
      .update(userApiKeys)
      .set({ ciphertext: encryptApiKey("old", "old-secret", "x") });
    const body = await json<{ keys: KeyStatus[] }>(await get(keysUrl(a.base)));
    expect(statusOf(body, "openai").needs_reentry).toBe(true);
    expect(statusOf(body, "openai").source).toBe("none");
  });

  it("rejects bad input without echoing the value", async () => {
    const spaced = await send(keysUrl(a.base, "openai"), "PUT", {
      api_key: "has spaces in-the-secret",
    });
    expect(spaced.status).toBe(400);
    expect(await spaced.text()).not.toContain("in-the-secret");

    const unknown = await send(keysUrl(a.base, "anthropic"), "PUT", {
      api_key: SECRET_KEY,
    });
    expect(unknown.status).toBe(400);
  });

  it("removes a key", async () => {
    const response = await send(keysUrl(a.base, "openai"), "DELETE");
    expect(response.status).toBe(200);
    const body = await json<{ keys: KeyStatus[] }>(response);
    expect(statusOf(body, "openai").source).toBe("none");
    expect(await storedRows()).toHaveLength(0);
  });
});

describe("tailoring with a user's own key", () => {
  it("sends that user's key to the provider, and only theirs", async () => {
    await send(`${a.base}/api/graph/import`, "POST", {
      format: "yaml",
      mode: "replace",
      content: `skills:
  - id: skill_typescript
    name: TypeScript
experiences:
  - id: exp_x
    role: Engineer
projects: []
achievements:
  - id: ach_x
    part_of: exp_x
    text: Built admin tools in TypeScript.
    skills: [skill_typescript]
`,
    });
    await send(`${a.base}/api/graph/review`, "POST");
    await send(keysUrl(a.base, "openai"), "PUT", { api_key: SECRET_KEY });

    const seen: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (
      input: Parameters<typeof fetch>[0],
      init?: RequestInit,
    ) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://127.0.0.1") || url.includes("localhost")) {
        return realFetch(input, init);
      }
      seen.push(
        String((init?.headers as Record<string, string>).Authorization),
      );
      return new Response("{}", { status: 400 });
    }) as typeof fetch;

    try {
      const response = await send(`${a.base}/api/tailor`, "POST", {
        jd_text: "Software Developer\nWe need TypeScript experience.",
        provider: "openai",
      });
      expect(response.status).toBe(201);
      const body = await response.text();
      // The provider rejected the call, so the run fell back offline,
      // and the key must not surface in the reported error.
      expect(body).not.toContain(SECRET_KEY);
    } finally {
      globalThis.fetch = realFetch;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set([`Bearer ${SECRET_KEY}`]));
  });

  it("reports the auto provider from the user's keys", async () => {
    const withKey = await json<{ auto: string }>(
      await get(`${a.base}/api/providers`),
    );
    expect(withKey.auto).toBe("openai (auto)");
    const withoutKey = await json<{ auto: string }>(
      await get(`${b.base}/api/providers`),
    );
    expect(withoutKey.auto).toContain("deterministic");
  });
});
