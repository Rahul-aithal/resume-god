import { Module } from "@nestjs/common";

import { LlmHttpService } from "./llm-http.service";
import { LlmProviderChainService } from "./provider-chain.service";

@Module({
  providers: [LlmHttpService, LlmProviderChainService],
  exports: [LlmProviderChainService, LlmHttpService],
})
export class LlmModule {}
