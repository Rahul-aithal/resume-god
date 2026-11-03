import { Module, Provider } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { validate } from "./config/validate";
import { firstNonEmpty, stripTrailingSlashes } from "./config/env-utils";
import { AuthHandle, createAuth } from "./auth/auth.server";
import { AuthController } from "./auth/auth.controller";
import { SessionGuard } from "./auth/session.guard";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import {
  THROTTLE_LIMIT,
  THROTTLE_TTL_MS,
} from "./common/constants/app.constants";
import { createValidationPipe } from "./common/validation/validation.pipe";
import { DatabaseModule, APP_DB } from "./db/database.module";
import { GraphModule } from "./graph/graph.module";
import type { AppDb } from "./db/client";
import { LlmModule } from "./llm/llm.module";
import { RenderController } from "./render/render.controller";
import { SettingsModule } from "./settings/settings.module";
import { TailorModule } from "./tailor/tailor.module";
import { TrackerModule } from "./tracker/tracker.module";

/**
 * Guard is injected so tests can pass a stub APP_GUARD provider —
 * an explicit factory keeps this deterministic under Bun (which does
 * not emit design:paramtypes for Nest's testing overrides).
 */
export function buildAppModule(
  guardProvider: Provider = {
    provide: APP_GUARD,
    useClass: SessionGuard,
  },
) {
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: [".env.local", ".env"],
        validate,
      }),
      ThrottlerModule.forRoot([
        { ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT },
      ]),
      DatabaseModule,
      GraphModule,
      LlmModule,
      SettingsModule,
      TailorModule,
      TrackerModule,
    ],
    controllers: [AuthController, RenderController],
    providers: [
      { provide: APP_PIPE, useFactory: createValidationPipe },
      {
        provide: AuthHandle,
        inject: [APP_DB, ConfigService],
        useFactory: (db: AppDb, config: ConfigService) => {
          const get = (key: string): string => config.get<string>(key) ?? "";
          return new AuthHandle(
            createAuth(db, {
              secret: firstNonEmpty(
                get("BETTER_AUTH_SECRET"),
                get("SESSION_SECRET"),
              ),
              baseURL: stripTrailingSlashes(
                firstNonEmpty(
                  get("BETTER_AUTH_URL"),
                  get("OAUTH_REDIRECT_BASE_URL"),
                ),
              ),
              trustedOrigins:
                config.get<string[]>("AUTH_TRUSTED_ORIGINS") ?? [],
              google: {
                clientId: get("GOOGLE_CLIENT_ID"),
                clientSecret: get("GOOGLE_CLIENT_SECRET"),
              },
            }),
          );
        },
      },
      guardProvider,
      { provide: APP_GUARD, useClass: ThrottlerGuard },
      { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
  })
  class DynamicAppModule {}
  return DynamicAppModule;
}

export const AppModule = buildAppModule();
