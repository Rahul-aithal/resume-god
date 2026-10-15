import { Module } from "@nestjs/common";

import { GraphModule } from "../graph/graph.module";
import { LlmModule } from "../llm/llm.module";
import { SettingsModule } from "../settings/settings.module";
import { TailorController } from "./tailor.controller";
import { TailorService } from "./tailor.service";
import { TypstRenderService } from "./typst-render.service";

@Module({
  imports: [GraphModule, LlmModule, SettingsModule],
  controllers: [TailorController],
  providers: [TailorService, TypstRenderService],
  exports: [TailorService],
})
export class TailorModule {}
