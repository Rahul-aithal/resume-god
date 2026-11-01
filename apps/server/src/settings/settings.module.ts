import { Module } from "@nestjs/common";

import { LlmModule } from "../llm/llm.module";
import { ApiKeyService } from "./api-key.service";
import { SettingsController } from "./settings.controller";
import { SettingsRepository } from "./settings.repository";
import { SettingsService } from "./settings.service";

@Module({
  imports: [LlmModule],
  controllers: [SettingsController],
  providers: [SettingsRepository, ApiKeyService, SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
