import { Module } from "@nestjs/common";

import { GraphRepository } from "./graph.repository";
import { GraphController } from "./graph.controller";
import { GraphService } from "./graph.service";

@Module({
  controllers: [GraphController],
  providers: [GraphRepository, GraphService],
  exports: [GraphService, GraphRepository],
})
export class GraphModule {}
