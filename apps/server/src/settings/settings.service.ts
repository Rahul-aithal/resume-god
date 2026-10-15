import { Injectable } from "@nestjs/common";

import { LlmProviderChainService } from "../llm/provider-chain.service";
import {
  SettingsRepository,
  type SettingsPatch,
  type UserSettings,
} from "./settings.repository";

@Injectable()
export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly llmChain: LlmProviderChainService,
  ) {}

  async get(userId: string): Promise<UserSettings> {
    return this.settings.find(userId);
  }

  async update(userId: string, patch: SettingsPatch): Promise<UserSettings> {
    return this.settings.update(userId, patch);
  }

  async providerStatus(userId: string) {
    const settings = await this.settings.find(userId);
    const order = settings.llm_order
      .split(",")
      .map((item: string) => item.trim())
      .filter(Boolean);
    return {
      order: order.length > 0 ? order : this.llmChain.defaultOrder(),
      auto: this.llmChain.activeLabel("auto"),
      models: {
        gemini: settings.gemini_model,
        glm: settings.glm_model,
        openai: settings.openai_model,
      },
      default_font: settings.default_font,
    };
  }
}
