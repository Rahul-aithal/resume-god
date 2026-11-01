import type { INestApplication, Provider } from "@nestjs/common";
import {
  StandardSchemaSerializerInterceptor,
  StandardSchemaValidationPipe,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";

import { AllExceptionsFilter } from "../src/common/all-exceptions.filter";

export interface TestUser {
  id: string;
  email: string;
  display_name: string;
}

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://resume_god:resume-god-local@localhost:5433/resume_god_test";

/** Wipe the shared test database. Call once per test FILE (beforeAll),
 * NOT per makeApp — multiple apps in one file share the database, and
 * truncating per app would delete the other app's user row (FK breakage). */
export async function resetDb() {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { migrateDb, truncateAll, getDb } = await import("../src/db/client");
  await migrateDb(TEST_DATABASE_URL);
  await truncateAll(getDb(TEST_DATABASE_URL));
}

export async function makeApp(user: TestUser) {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { buildAppModule } = await import("../src/app.module");
  const { getDb } = await import("../src/db/client");
  const { authUser } = await import("../src/db/schema");

  // Production parity: the user row exists before app data (Better Auth
  // creates it during OAuth sign-in); app tables FK-reference it.
  await getDb(TEST_DATABASE_URL)
    .insert(authUser)
    .values({
      id: user.id,
      name: user.display_name,
      email: user.email,
      emailVerified: true,
    })
    .onConflictDoNothing();

  const guard: Provider = {
    provide: "APP_GUARD",
    useValue: {
      canActivate: (context: {
        switchToHttp: () => { getRequest: () => unknown };
      }) => {
        const request = context.switchToHttp().getRequest() as Record<
          string,
          unknown
        >;
        request.user = user;
        return true;
      },
    },
  };

  const moduleRef = await Test.createTestingModule({
    imports: [buildAppModule(guard)],
  }).compile();

  const app = moduleRef.createNestApplication();
  // Mirror main.ts: schema validation + schema-shaped responses + envelope.
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalInterceptors(
    new StandardSchemaSerializerInterceptor(app.get(Reflector)),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address();
  const port = address && typeof address === "object" ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;

  return {
    app: app as INestApplication,
    base,
    close: async () => {
      await app.close();
    },
  };
}

export function get(url: string) {
  return fetch(url);
}

export function send(url: string, method: string, body?: unknown) {
  return fetch(url, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Default Record (not any): bun's expect() has an (actual?: never) =>
// Matchers<undefined> overload, and an `any` actual silently selects it.
export async function json<T = Record<string, any>>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

/** ValidationPipe emits `message` as string OR string[]; normalize. */
export function firstMessage(body: { message: string | string[] }): string {
  return Array.isArray(body.message) ? body.message.join("; ") : body.message;
}

export const USER_A: TestUser = {
  id: "user-a",
  email: "a@example.com",
  display_name: "User A",
};

export const USER_B: TestUser = {
  id: "user-b",
  email: "b@example.com",
  display_name: "User B",
};
