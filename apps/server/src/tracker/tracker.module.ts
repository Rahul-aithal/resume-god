import { Module } from "@nestjs/common";

import { TrackerController } from "./tracker.controller";
import { TrackerRepository } from "./tracker.repository";
import { TrackerService } from "./tracker.service";

@Module({
  controllers: [TrackerController],
  providers: [TrackerRepository, TrackerService],
  exports: [TrackerRepository],
})
export class TrackerModule {}
