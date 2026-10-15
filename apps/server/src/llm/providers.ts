import { Injectable } from "@nestjs/common";

import { LlmError, extractJsonObject } from "./extract-json";
import { contentFromChoices, type LlmProvider } from "./llm-provider.interface";
import type { LlmHttpService } from "./llm-http.service";

@Injectable()
export class GlmProvider implements LlmProvider {
  readonly name = "glm" as const;

  constructor(
    private readonly http: LlmHttpService,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly apiUrl: string,
  ) {}

  static create(
    http: LlmHttpService,
    cfg: { glmKey: string; glmModel: string; glmApiUrl: string },
  ): GlmProvider {
    if (!cfg.glmKey) {
      throw new LlmError(
        "Set GLM_API_KEY (or ZAI_API_KEY) for the glm provider",
      );
    }
    return new GlmProvider(http, cfg.glmKey, cfg.glmModel, cfg.glmApiUrl);
  }

  async completeJson(prompt: string): Promise<Record<string, unknown>> {
    const payload = await this.http.postJson(
      this.apiUrl,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: "system", content: "Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
      },
    );
    return extractJsonObject(contentFromChoices(payload, this.name));
  }
}

@Injectable()
export class GeminiProvider implements LlmProvider {
  readonly name = "gemini" as const;

  constructor(
    private readonly http: LlmHttpService,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  static create(
    http: LlmHttpService,
    cfg: { geminiKey: string; geminiModel: string },
  ): GeminiProvider {
    if (!cfg.geminiKey) {
      throw new LlmError("Set GEMINI_API_KEY for the gemini provider");
    }
    return new GeminiProvider(http, cfg.geminiKey, cfg.geminiModel);
  }

  async completeJson(prompt: string): Promise<Record<string, unknown>> {
    const payload = await this.http.postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      { "x-goog-api-key": this.apiKey },
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0,
        },
      },
    );
    const record = payload as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    };
    const text = record?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      throw new LlmError(
        `Unexpected gemini response: ${JSON.stringify(payload)}`,
      );
    }
    return extractJsonObject(text);
  }
}

@Injectable()
export class OpenAiProvider implements LlmProvider {
  readonly name = "openai" as const;

  constructor(
    private readonly http: LlmHttpService,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly apiUrl: string,
  ) {}

  static create(
    http: LlmHttpService,
    cfg: { openaiKey: string; openaiModel: string; openaiApiUrl: string },
  ): OpenAiProvider {
    if (!cfg.openaiKey) {
      throw new LlmError("Set OPENAI_API_KEY for the openai provider");
    }
    return new OpenAiProvider(
      http,
      cfg.openaiKey,
      cfg.openaiModel,
      cfg.openaiApiUrl,
    );
  }

  async completeJson(prompt: string): Promise<Record<string, unknown>> {
    const payload = await this.http.postJson(
      `${this.apiUrl.replace(/\/+$/, "")}/chat/completions`,
      { Authorization: `Bearer ${this.apiKey}` },
      {
        model: this.model,
        messages: [
          { role: "system", content: "Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        response_format: { type: "json_object" },
      },
    );
    return extractJsonObject(contentFromChoices(payload, this.name));
  }
}
