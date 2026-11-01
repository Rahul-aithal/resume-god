import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { firstNonEmpty } from "../config/env-utils";
import { LlmError } from "./extract-json";
import { LlmHttpService } from "./llm-http.service";
import { GeminiProvider, GlmProvider, OpenAiProvider } from "./providers";
import {
  KNOWN_PROVIDERS,
  type LlmProvider,
  type ProviderName,
} from "./llm-provider.interface";

export type { LlmProvider, ProviderName };

/** A user's own keys, used in place of the server's for that provider. */
export type UserKeys = Partial<Record<ProviderName, string>>;

export type ProviderChoice =
  "auto" | "deterministic" | ProviderName | (string & {});

export interface AttemptResult<T> {
  result: T;
  used: string;
  errors: string[];
}

/**
 * Port of llm.py resolve_provider_list / attempt_each: ordered provider
 * chain per step, failover to deterministic, never a crash for missing
 * configuration.
 */
@Injectable()
export class LlmProviderChainService {
  constructor(
    private readonly http: LlmHttpService,
    // Bun does not emit design:paramtypes for symbol tokens; explicit is required.
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  /** Flat validated reads + the two key-name fallback chains. */
  private get cfg() {
    const get = (key: string): string => this.config.get<string>(key) ?? "";
    return {
      geminiKey: firstNonEmpty(get("GEMINI_API_KEY"), get("GOOGLE_API_KEY")),
      glmKey: firstNonEmpty(
        get("GLM_API_KEY"),
        get("ZAI_API_KEY"),
        get("Z_AI_API_KEY"),
        get("ZHIPU_API_KEY"),
      ),
      openaiKey: get("OPENAI_API_KEY"),
      order: this.config.get<string[]>("RESUME_GOD_LLM_ORDER") ?? [],
      geminiModel: get("GEMINI_MODEL"),
      glmModel: get("GLM_MODEL"),
      openaiModel: get("OPENAI_MODEL"),
      glmApiUrl: get("GLM_API_URL"),
      openaiApiUrl: get("OPENAI_API_URL"),
    };
  }

  defaultOrder(orderOverride?: string[]): ProviderName[] {
    const source = orderOverride ?? this.cfg.order;
    const filtered = source.filter((item): item is ProviderName =>
      (KNOWN_PROVIDERS as string[]).includes(item),
    );
    return filtered.length > 0 ? filtered : ["gemini", "glm", "openai"];
  }

  hasServerKey(name: ProviderName): boolean {
    switch (name) {
      case "gemini":
        return Boolean(this.cfg.geminiKey);
      case "glm":
        return Boolean(this.cfg.glmKey);
      case "openai":
        return Boolean(this.cfg.openaiKey);
    }
  }

  private hasKey(name: ProviderName, userKeys?: UserKeys): boolean {
    return Boolean(userKeys?.[name]) || this.hasServerKey(name);
  }

  private make(name: ProviderName, userKeys?: UserKeys): LlmProvider {
    const cfg = this.cfg;
    switch (name) {
      case "glm":
        return GlmProvider.create(this.http, {
          glmKey: userKeys?.glm || cfg.glmKey,
          glmModel: cfg.glmModel,
          glmApiUrl: cfg.glmApiUrl,
        });
      case "gemini":
        return GeminiProvider.create(this.http, {
          geminiKey: userKeys?.gemini || cfg.geminiKey,
          geminiModel: cfg.geminiModel,
        });
      case "openai":
        return OpenAiProvider.create(this.http, {
          openaiKey: userKeys?.openai || cfg.openaiKey,
          openaiModel: cfg.openaiModel,
          openaiApiUrl: cfg.openaiApiUrl,
        });
    }
  }

  /**
   * Ordered providers to attempt for one pipeline step.
   * - deterministic/null → [] (fully offline)
   * - auto → every keyed provider in order (may be empty)
   * - explicit with key → [it] plus other keyed providers as fallback
   * - explicit without key / unknown → error (caller falls back offline)
   */
  resolveList(
    choice: ProviderChoice | null,
    orderOverride?: string[],
    userKeys?: UserKeys,
  ): {
    providers: LlmProvider[];
    requested: string;
    error?: string;
  } {
    const requested = choice ?? "deterministic";
    if (choice == null || choice === "deterministic") {
      return { providers: [], requested };
    }
    if (choice === "auto") {
      const providers: LlmProvider[] = [];
      for (const candidate of this.defaultOrder(orderOverride)) {
        if (!this.hasKey(candidate, userKeys)) continue;
        try {
          providers.push(this.make(candidate, userKeys));
        } catch {
          continue;
        }
      }
      return { providers, requested };
    }
    if ((KNOWN_PROVIDERS as string[]).includes(choice)) {
      const name = choice as ProviderName;
      try {
        const first = this.make(name, userKeys);
        const rest: LlmProvider[] = [];
        for (const candidate of this.defaultOrder(orderOverride)) {
          if (candidate === name || !this.hasKey(candidate, userKeys)) continue;
          try {
            rest.push(this.make(candidate, userKeys));
          } catch {
            continue;
          }
        }
        return { providers: [first, ...rest], requested };
      } catch (error) {
        return {
          providers: [],
          requested,
          error: error instanceof LlmError ? error.message : String(error),
        };
      }
    }
    return {
      providers: [],
      requested,
      error: `Unknown LLM provider: ${choice}. Use ${KNOWN_PROVIDERS.join(", ")}.`,
    };
  }

  /** Try run(provider) in order; fall back to run(null) → deterministic. */
  async attemptEach<T>(
    providers: LlmProvider[],
    run: (
      provider: LlmProvider | null,
    ) => Promise<{ result: T; ok: boolean; detail: string }>,
  ): Promise<AttemptResult<T>> {
    const errors: string[] = [];
    for (const provider of providers) {
      const { result, ok, detail } = await run(provider);
      if (ok) return { result, used: provider.name, errors };
      errors.push(`${provider.name} failed${detail ? `: ${detail}` : ""}`);
    }
    const { result, detail } = await run(null);
    if (detail) errors.push(`deterministic: ${detail}`);
    return { result, used: "deterministic", errors };
  }

  /** Human-readable label for what auto resolution would use (no calls). */
  activeLabel(
    choice: string | null,
    userKeys?: UserKeys,
    orderOverride?: string[],
  ): string {
    if (choice == null || choice === "deterministic")
      return "deterministic (offline)";
    if ((KNOWN_PROVIDERS as string[]).includes(choice)) {
      return `${choice} (${this.hasKey(choice as ProviderName, userKeys) ? "key found" : "NO KEY — will fall back offline"})`;
    }
    if (choice === "auto") {
      for (const candidate of this.defaultOrder(orderOverride)) {
        if (this.hasKey(candidate, userKeys)) return `${candidate} (auto)`;
      }
      return "deterministic (auto — no keys found)";
    }
    return String(choice);
  }
}
