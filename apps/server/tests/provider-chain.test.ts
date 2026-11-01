import { afterEach, describe, expect, it } from "bun:test";

import { LlmProviderChainService } from "../src/llm/provider-chain.service";
import {
  GeminiProvider,
  GlmProvider,
  OpenAiProvider,
} from "../src/llm/providers";
import { LlmHttpService } from "../src/llm/llm-http.service";
import type { LlmProvider } from "../src/llm/llm-provider.interface";
import type { ConfigService } from "@nestjs/config";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function chainWith(env: Record<string, string>): LlmProviderChainService {
  scrubLlmEnv();
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  // Mirror production: flat validated reads straight from process.env.
  const values: Record<string, string | string[]> = {
    ...process.env,
    RESUME_GOD_LLM_ORDER: (process.env.RESUME_GOD_LLM_ORDER ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
    GEMINI_MODEL: "gemini-test",
    GLM_MODEL: "glm-test",
    OPENAI_MODEL: "gpt-test",
    GLM_API_URL: "http://glm.test",
    OPENAI_API_URL: "http://openai.test",
  };
  const config = {
    get: (key: string) => values[key] ?? "",
  };
  const http = new LlmHttpService();
  return new LlmProviderChainService(http, config as unknown as ConfigService);
}

function scrubLlmEnv() {
  for (const key of [
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GLM_API_KEY",
    "OPENAI_API_KEY",
    "RESUME_GOD_LLM_ORDER",
  ]) {
    delete process.env[key];
  }
}

describe("provider chain resolution", () => {
  it("deterministic resolves to an empty chain", () => {
    scrubLlmEnv();
    const { providers, requested } = chainWith({}).resolveList("deterministic");
    expect(providers).toHaveLength(0);
    expect(requested).toBe("deterministic");
  });

  it("auto lists keyed providers in default order", () => {
    const chain = chainWith({
      GEMINI_API_KEY: "k",
      GLM_API_KEY: "k",
      OPENAI_API_KEY: "k",
    });
    const { providers, requested, error } = chain.resolveList("auto");
    expect(requested).toBe("auto");
    expect(error).toBeUndefined();
    expect(providers.map((p) => p.name)).toEqual(["gemini", "glm", "openai"]);
  });

  it("explicit choice puts the chosen provider first, keyed others as fallback", () => {
    const chain = chainWith({ GLM_API_KEY: "k", OPENAI_API_KEY: "k" });
    const { providers } = chain.resolveList("openai");
    expect(providers.map((p) => p.name)).toEqual(["openai", "glm"]);
  });

  it("explicit choice without a key reports an error instead of throwing", () => {
    scrubLlmEnv();
    const { providers, error } = chainWith({}).resolveList("openai");
    expect(providers).toHaveLength(0);
    expect(error).toContain("OPENAI_API_KEY");
  });

  it("unknown providers report an error", () => {
    scrubLlmEnv();
    const { providers, error } = chainWith({}).resolveList("nope");
    expect(providers).toHaveLength(0);
    expect(error).toContain("Unknown LLM provider");
  });
});

describe("attemptEach failover", () => {
  it("first success wins", async () => {
    const chain = chainWith({});
    const providers: LlmProvider[] = [
      { name: "gemini", completeJson: async () => ({}) },
      { name: "glm", completeJson: async () => ({}) },
    ];
    const calls: Array<string | null> = [];
    const { result, used, errors } = await chain.attemptEach(
      providers,
      async (provider) => {
        calls.push(provider?.name ?? null);
        return { result: `ok-${provider?.name}`, ok: true, detail: "" };
      },
    );
    expect(result).toBe("ok-gemini");
    expect(used).toBe("gemini");
    expect(errors).toEqual([]);
    expect(calls).toEqual(["gemini"]);
  });

  it("falls through failures then to deterministic", async () => {
    const chain = chainWith({});
    const providers: LlmProvider[] = [
      { name: "gemini", completeJson: async () => ({}) },
      { name: "glm", completeJson: async () => ({}) },
    ];
    const calls: Array<string | null> = [];
    const { result, used, errors } = await chain.attemptEach(
      providers,
      async (provider) => {
        calls.push(provider?.name ?? null);
        if (provider)
          return { result: null, ok: false, detail: `boom-${provider.name}` };
        return { result: "offline", ok: true, detail: "" };
      },
    );
    expect(result).toBe("offline");
    expect(used).toBe("deterministic");
    expect(errors).toEqual([
      "gemini failed: boom-gemini",
      "glm failed: boom-glm",
    ]);
    expect(calls).toEqual(["gemini", "glm", null]);
  });
});

describe("provider payload shapes", () => {
  it("openai posts JSON mode to chat/completions and parses the content", async () => {
    let capturedUrl = "";
    let capturedPayload: unknown;
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedPayload = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"selected": ["a"]}' } }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const provider = OpenAiProvider.create(new LlmHttpService(), {
      openaiKey: "test-key",
      openaiModel: "gpt-test",
      openaiApiUrl: "https://api.openai.com/v1",
    });
    const result = await provider.completeJson("pick bullets");
    expect(result).toEqual({ selected: ["a"] });
    expect(capturedUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect((capturedPayload as { model: string }).model).toBe("gpt-test");
    expect(
      (capturedPayload as { response_format: { type: string } })
        .response_format,
    ).toEqual({ type: "json_object" });
  });

  it("gemini posts generationConfig with JSON mime type", async () => {
    let capturedPayload: unknown;
    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"ok": 1}' }] } }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    // Capture via a tiny wrapper.
    const realPost = LlmHttpService.prototype.postJson;
    const http = new LlmHttpService();
    http.postJson = async (url, headers, payload) => {
      capturedPayload = payload;
      expect((headers as Record<string, string>)["x-goog-api-key"]).toBe(
        "test-key",
      );
      return realPost.call(http, url, headers, payload, [0]);
    };
    const provider = GeminiProvider.create(http, {
      geminiKey: "test-key",
      geminiModel: "gemini-test",
    });
    expect(await provider.completeJson("x")).toEqual({ ok: 1 });
    expect(
      (capturedPayload as { generationConfig: { responseMimeType: string } })
        .generationConfig.responseMimeType,
    ).toBe("application/json");
  });

  it("constructors without keys throw LlmError", () => {
    expect(() =>
      OpenAiProvider.create(new LlmHttpService(), {
        openaiKey: "",
        openaiModel: "m",
        openaiApiUrl: "u",
      }),
    ).toThrow("OPENAI_API_KEY");
    expect(() =>
      GlmProvider.create(new LlmHttpService(), {
        glmKey: "",
        glmModel: "m",
        glmApiUrl: "u",
      }),
    ).toThrow("GLM_API_KEY");
    expect(() =>
      GeminiProvider.create(new LlmHttpService(), {
        geminiKey: "",
        geminiModel: "m",
      }),
    ).toThrow("GEMINI_API_KEY");
  });
});
