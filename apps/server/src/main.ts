import "reflect-metadata";

import { StandardSchemaSerializerInterceptor } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory, Reflector } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import * as express from "express";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/all-exceptions.filter";
import { DEFAULT_PORT } from "./config/constants/config.constants";
import { migrateDb } from "./db/client";

async function bootstrap() {
  // Apply pending migrations before serving (Postgres is the only store).
  await migrateDb();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const config = app.get(ConfigService);

  // Generated files (PDFs, Typst sources).
  const configured = config.get<string>("OUTPUTS_DIR");
  const files =
    configured && configured.trim()
      ? resolve(configured)
      : resolve(import.meta.dir, "../../../outputs");
  mkdirSync(files, { recursive: true });
  app.use("/files", express.static(files));

  // Requests are validated by DTOs (APP_PIPE in the app module). Responses
  // are shaped by schemas, on routes with @SerializeOptions.
  app.useGlobalInterceptors(
    new StandardSchemaSerializerInterceptor(app.get(Reflector)),
  );

  // Consistent error envelope + graceful shutdown.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get<number>("PORT", DEFAULT_PORT);
  await app.listen(port, "0.0.0.0");
  console.log(`resume-god server listening on http://localhost:${port}`);
}

await bootstrap();
