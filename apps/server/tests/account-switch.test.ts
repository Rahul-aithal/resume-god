import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "bun:test";

import { TEST_DATABASE_URL, json, resetDb } from "./helpers";

let base: string;
let close: () => Promise<void>;
let context: any;
let cookieName: string;

const sign = (value: string) =>
  encodeURIComponent(
    `${value}.${createHmac("sha256", context.secret).update(value).digest("base64")}`,
  );

interface Signed {
  id: string;
  token: string;
}

async function signIn(id: string, email: string): Promise<Signed> {
  await context.internalAdapter.createUser({
    id,
    email,
    name: id,
    emailVerified: true,
  });
  const user = await context.internalAdapter.findUserByEmail(email);
  const session = await context.internalAdapter.createSession(user.user.id);
  return { id: user.user.id, token: session.token };
}

const cookies = (active: Signed, ...device: Signed[]) =>
  [
    `${cookieName}=${sign(active.token)}`,
    ...device.map(
      (entry) =>
        `${cookieName}_multi-${entry.token.toLowerCase()}=${sign(entry.token)}`,
    ),
  ].join("; ");

let ada: Signed;
let grace: Signed;
let stranger: Signed;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.BETTER_AUTH_SECRET = "test-secret-for-account-switching";
  process.env.GOOGLE_CLIENT_ID = "test-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-secret";
  await resetDb();
  const { AppModule } = await import("../src/app.module");
  const { AuthHandle } = await import("../src/auth/auth.server");
  const { Test } = await import("@nestjs/testing");
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  const app = moduleRef.createNestApplication();
  await app.listen(0);
  const address = app.getHttpServer().address();
  base = `http://127.0.0.1:${address && typeof address === "object" ? address.port : 0}`;
  close = () => app.close();

  context = await (app.get(AuthHandle) as any).instance.$context;
  cookieName = context.authCookies.sessionToken.name;
  ada = await signIn(crypto.randomUUID(), "ada@example.com");
  grace = await signIn(crypto.randomUUID(), "grace@example.com");
  stranger = await signIn(crypto.randomUUID(), "stranger@example.com");
});

afterAll(async () => {
  await close();
});

const accounts = (cookie: string) =>
  fetch(`${base}/api/auth/accounts`, { headers: { cookie } });

const switchTo = (cookie: string, userId: string) =>
  fetch(`${base}/api/auth/accounts/switch`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId }),
  });

const applySetCookies = (cookie: string, response: Response) => {
  const jar = new Map(
    cookie.split("; ").map((pair) => {
      const index = pair.indexOf("=");
      return [pair.slice(0, index), pair.slice(index + 1)] as const;
    }),
  );
  for (const header of response.headers.getSetCookie()) {
    const [pair] = header.split(";");
    const index = pair.indexOf("=");
    jar.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
};

describe("account switching", () => {
  it("lists this browser's accounts, active first, without tokens", async () => {
    const response = await accounts(cookies(ada, ada, grace));
    expect(response.status).toBe(200);
    const raw = await response.text();
    expect(raw).not.toContain(ada.token);
    expect(raw).not.toContain(grace.token);
    const body = JSON.parse(raw);
    expect(
      body.accounts.map((account: { email: string; active: boolean }) => [
        account.email,
        account.active,
      ]),
    ).toEqual([
      ["ada@example.com", true],
      ["grace@example.com", false],
    ]);
  });

  it("includes a session from before multi-session cookies existed", async () => {
    const body = await json<{ accounts: unknown[] }>(
      await accounts(cookies(ada)),
    );
    expect(body.accounts).toHaveLength(1);
  });

  it("rejects anonymous requests", async () => {
    expect((await accounts("")).status).toBe(401);
  });

  it("switches the active account", async () => {
    const before = cookies(ada, ada, grace);
    const response = await switchTo(before, grace.id);
    expect(response.status).toBe(201);
    expect(await response.text()).not.toContain(grace.token);

    const after = applySetCookies(before, response);
    const me = await json<{ email: string }>(
      await fetch(`${base}/api/auth/me`, { headers: { cookie: after } }),
    );
    expect(me.email).toBe("grace@example.com");
  });

  it("refuses an account not signed in on this browser", async () => {
    const response = await switchTo(cookies(ada, ada), stranger.id);
    expect(response.status).toBe(404);
  });

  it("asks Google to show its chooser only when adding an account", async () => {
    const location = async (query: string) =>
      (
        await fetch(`${base}/api/auth/login/google${query}`, {
          redirect: "manual",
        })
      ).headers.get("location") ?? "";
    expect(await location("?add=1")).toContain("prompt=select_account");
    expect(await location("")).not.toContain("prompt=");
  });

  it("logs every account out and clears the cookies", async () => {
    const cookie = cookies(ada, ada, grace);
    const response = await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { cookie },
    });
    expect(response.status).toBe(201);
    const cleared = response.headers.getSetCookie();
    expect(cleared.some((value) => value.startsWith(`${cookieName}=`))).toBe(
      true,
    );
    expect(cleared.some((value) => value.includes("_multi-"))).toBe(true);
    expect(await context.internalAdapter.findSession(ada.token)).toBeNull();
    expect(await context.internalAdapter.findSession(grace.token)).toBeNull();
    expect((await accounts(cookie)).status).toBe(401);
  });
});
