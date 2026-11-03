import { Module } from "@nestjs/common";

import { GraphModule } from "../graph/graph.module";
import { LlmModule } from "../llm/llm.module";
import { SettingsModule } from "../settings/settings.module";
import { TrackerModule } from "../tracker/tracker.module";
import { TailorJobsService } from "./tailor-jobs.service";
import { TailorController } from "./tailor.controller";
import { TailorService } from "./tailor.service";
import { TypstRenderService } from "./typst-render.service";

@Module({
  imports: [GraphModule, LlmModule, SettingsModule, TrackerModule],
  controllers: [TailorController],
  providers: [TailorService, TailorJobsService, TypstRenderService],
  exports: [TailorService],
})
export class TailorModule {}
