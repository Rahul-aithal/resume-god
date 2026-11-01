import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";

import { APP_DB } from "../db/database.module";
import type { AppDb } from "../db/client";
import { userSettings } from "../db/schema";

export const DEFAULT_SETTINGS = {
  llm_order: "gemini,glm,openai",
  gemini_model: "gemini-3-flash-preview",
  glm_model: "glm-4.6",
  openai_model: "gpt-4.1",
  default_font: "Calibri",
};

export type UserSettings = typeof DEFAULT_SETTINGS;

export interface SettingsPatch {
  llm_order?: string;
  gemini_model?: string;
  glm_model?: string;
  openai_model?: string;
  default_font?: string;
}

const COLUMN_MAP = {
  llm_order: "llmOrder",
  gemini_model: "geminiModel",
  glm_model: "glmModel",
  openai_model: "openaiModel",
  default_font: "defaultFont",
} as const;

@Injectable()
export class SettingsRepository {
  constructor(@Inject(APP_DB) private readonly db: AppDb) {}

  async find(userId: string): Promise<UserSettings> {
    const [row] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    if (!row) return { ...DEFAULT_SETTINGS };
    return {
      llm_order: row.llmOrder,
      gemini_model: row.geminiModel,
      glm_model: row.glmModel,
      openai_model: row.openaiModel || DEFAULT_SETTINGS.openai_model,
      default_font: row.defaultFont,
    };
  }

  async update(userId: string, patch: SettingsPatch): Promise<UserSettings> {
    const columns: Record<string, string | Date> = {};
    for (const [api, column] of Object.entries(COLUMN_MAP)) {
      const value = patch[api as keyof SettingsPatch];
      if (value != null) columns[column] = value;
    }
    const [existing] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId));
    if (!existing) {
      await this.db.insert(userSettings).values({ userId, ...columns });
    } else if (Object.keys(columns).length > 0) {
      await this.db
        .update(userSettings)
        .set({ ...columns, updatedAt: new Date() })
        .where(eq(userSettings.userId, userId));
    }
    return this.find(userId);
  }
}
