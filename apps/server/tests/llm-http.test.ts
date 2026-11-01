import { afterEach, describe, expect, it } from "bun:test";

import { LlmHttpService } from "../src/llm/llm-http.service";

const originalFetch = globalThis.fetch;

function httpService() {
  return new LlmHttpService();
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("LlmHttpService retry behaviour", () => {
  it("retries transient errors then succeeds", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls < 3) throw new TypeError("fetch failed");
      return new Response('{"ok": true}', { status: 200 });
    }) as unknown as typeof fetch;

    const result = await httpService().postJson("http://x", {}, {}, [0, 0, 0]);
    expect(result).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("does not retry non-retryable statuses", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 400 });
    }) as unknown as typeof fetch;

    await expect(
      httpService().postJson("http://x", {}, {}, [0, 0, 0]),
    ).rejects.toThrow("LLM request failed");
    expect(calls).toBe(1);
  });

  it("gives up after exhausting retries", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("{}", { status: 429 });
    }) as unknown as typeof fetch;

    await expect(
      httpService().postJson("http://x", {}, {}, [0, 0, 0]),
    ).rejects.toThrow("LLM request failed");
    expect(calls).toBe(4);
  });
});
