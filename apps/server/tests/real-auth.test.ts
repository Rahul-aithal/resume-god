import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import {
  TEST_DATABASE_URL,
  USER_A,
  firstMessage,
  json,
  resetDb,
} from "./helpers";

let base: string;
let close: () => Promise<void>;

beforeAll(async () => {
  // Dynamic import AFTER env is set: real guard, real Better Auth.
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  const { AppModule } = await import("../src/app.module");
  const { getDb, migrateDb, truncateAll } = await import("../src/db/client");
  await resetDb();
  const { Test } = await import("@nestjs/testing");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  await app.listen(0);
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
  close = () => app.close();
});

afterAll(async () => {
  await close();
});

describe("real auth wiring", () => {
  it("better auth ok endpoint responds", async () => {
    const response = await fetch(`${base}/api/auth/ok`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(body).toEqual({ ok: true });
  });

  it("guarded routes reject anonymous requests with the Nest error shape", async () => {
    const response = await fetch(`${base}/api/settings`);
    expect(response.status).toBe(401);
    const body = await json<{ message: string }>(response);
    expect(body.message).toBe("Login required");
  });

  it("auth providers reports unconfigured google without crashing", async () => {
    const response = await fetch(`${base}/api/auth/providers`);
    expect(response.status).toBe(200);
    const body = await json(response);
    expect(typeof body.redirect_uri).toBe("string");
    expect(body.redirect_uri).toContain("/api/auth/callback/google");
  });

  it("login without google config is 503 with setup hint", async () => {
    const response = await fetch(`${base}/api/auth/login/google`);
    if (process.env.GOOGLE_CLIENT_ID) {
      // Configured env: expect a redirect into the OAuth flow instead.
      expect(response.status).toBe(302);
      return;
    }
    expect(response.status).toBe(503);
    expect(firstMessage(await json(response))).toContain(
      "Google OAuth is not configured",
    );
  });
});
