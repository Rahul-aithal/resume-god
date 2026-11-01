import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { getDb, type AppDb } from "./client";

export const APP_DB = Symbol("APP_DB");

@Global()
@Module({
  providers: [
    {
      provide: APP_DB,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        getDb(config.get<string>("DATABASE_URL")),
    },
  ],
  exports: [APP_DB],
})
export class DatabaseModule {}
