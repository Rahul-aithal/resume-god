import {
  Inject,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";

import { firstNonEmpty } from "../config/env-utils";
import type { AppDb } from "../db/client";
import { APP_DB } from "../db/database.module";
import { userApiKeys } from "../db/schema";
import { LlmProviderChainService } from "../llm/provider-chain.service";
import {
  KNOWN_PROVIDERS,
  type ProviderName,
} from "../llm/llm-provider.interface";
import { decryptApiKey, encryptApiKey } from "./api-key-crypto";
import { API_KEY_VISIBLE_SUFFIX } from "./constants/settings.constants";

export type ApiKeySource = "user" | "server" | "none";

export interface ApiKeyStatus {
  provider: ProviderName;
  /** Which key a run would use. A user's own key beats the server's. */
  source: ApiKeySource;
  /** Last characters of the user's key, for recognising it. Never the key. */
  last4: string | null;
  /** A key is stored but can't be decrypted, so it must be entered again. */
  needs_reentry: boolean;
}

@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(APP_DB) private readonly db: AppDb,
    @Inject(ConfigService) private readonly config: ConfigService,
    private readonly chain: LlmProviderChainService,
  ) {}

  private get secret(): string {
    const get = (key: string) => this.config.get<string>(key) ?? "";
    return firstNonEmpty(get("BETTER_AUTH_SECRET"), get("SESSION_SECRET"));
  }

  private context(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  /** Decrypted keys for one pipeline run. Unreadable rows are skipped. */
  async keysFor(
    userId: string,
  ): Promise<Partial<Record<ProviderName, string>>> {
    const rows = await this.db
      .select()
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, userId));
    const keys: Partial<Record<ProviderName, string>> = {};
    for (const row of rows) {
      const key = decryptApiKey(
        row.ciphertext,
        this.secret,
        this.context(userId, row.provider),
      );
      if (key) keys[row.provider as ProviderName] = key;
    }
    return keys;
  }

  async list(userId: string): Promise<ApiKeyStatus[]> {
    const rows = await this.db
      .select()
      .from(userApiKeys)
      .where(eq(userApiKeys.userId, userId));
    return KNOWN_PROVIDERS.map((provider) => {
      const row = rows.find((candidate) => candidate.provider === provider);
      const readable =
        row != null &&
        decryptApiKey(
          row.ciphertext,
          this.secret,
          this.context(userId, provider),
        ) !== null;
      const source: ApiKeySource = readable
        ? "user"
        : this.chain.hasServerKey(provider)
          ? "server"
          : "none";
      return {
        provider,
        source,
        last4: row?.last4 ?? null,
        needs_reentry: row != null && !readable,
      };
    });
  }

  async save(
    userId: string,
    provider: ProviderName,
    apiKey: string,
  ): Promise<ApiKeyStatus[]> {
    if (!this.secret) {
      throw new ServiceUnavailableException(
        "Saving API keys needs BETTER_AUTH_SECRET or SESSION_SECRET on the server.",
      );
    }
    const values = {
      ciphertext: encryptApiKey(
        apiKey,
        this.secret,
        this.context(userId, provider),
      ),
      last4: apiKey.slice(-API_KEY_VISIBLE_SUFFIX),
      updatedAt: new Date(),
    };
    await this.db
      .insert(userApiKeys)
      .values({ userId, provider, ...values })
      .onConflictDoUpdate({
        target: [userApiKeys.userId, userApiKeys.provider],
        set: values,
      });
    return this.list(userId);
  }

  async remove(
    userId: string,
    provider: ProviderName,
  ): Promise<ApiKeyStatus[]> {
    await this.db
      .delete(userApiKeys)
      .where(
        and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)),
      );
    return this.list(userId);
  }
}
