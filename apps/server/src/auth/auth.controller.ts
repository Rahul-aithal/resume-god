import {
  All,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";

import { firstNonEmpty, stripTrailingSlashes } from "../config/env-utils";
import { AuthHandle } from "./auth.server";
import { Public } from "./session.guard";

const switchAccountSchema = z.strictObject({
  user_id: z.string().min(1),
});

/**
 * Auth surface:
 * - GET  /api/auth/providers  (login page helper; stable SPA contract)
 * - GET  /api/auth/login/google      → 302 into Better Auth's Google flow
 * - GET  /api/auth/callback/google   → Better Auth catch-all below
 * - POST /api/auth/logout     (SPA convenience alias for sign-out)
 * - GET  /api/auth/me         (session user for the SPA)
 * - GET  /api/auth/accounts   (accounts signed in on this browser)
 * - POST /api/auth/accounts/switch  (make one of them active)
 * - ALL  /api/auth/*path      → proxied into Better Auth's handler
 */
@Controller("api/auth")
export class AuthController {
  constructor(
    private readonly auth: AuthHandle,
    private readonly config: ConfigService,
  ) {}

  private get google() {
    return {
      clientId: this.config.get<string>("GOOGLE_CLIENT_ID") ?? "",
      clientSecret: this.config.get<string>("GOOGLE_CLIENT_SECRET") ?? "",
    };
  }

  private get redirectBaseURL(): string {
    return this.config.get<string>("OAUTH_REDIRECT_BASE_URL") ?? "";
  }

  private get baseURL(): string {
    return stripTrailingSlashes(
      firstNonEmpty(
        this.config.get<string>("BETTER_AUTH_URL"),
        this.config.get<string>("OAUTH_REDIRECT_BASE_URL"),
      ),
    );
  }

  @Public()
  @Get("providers")
  providers(@Req() request: Request) {
    const google = this.google;
    const base = this.publicBaseUrl(request);
    const configured = Boolean(google.clientId && google.clientSecret);
    return {
      google: {
        configured,
        login_path: "/api/auth/login/google",
      },
      redirect_uri: `${base}/api/auth/callback/google`,
      base_url_source: this.redirectBaseURL ? "env" : "request",
    };
  }

  @Public()
  @Get("login/google")
  @Redirect()
  async loginGoogle(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query("add") addAccount?: string,
  ) {
    const google = this.google;
    if (!google.clientId || !google.clientSecret) {
      throw new ServiceUnavailableException(
        "Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      );
    }
    // returnHeaders: true is required: Better Auth returns the signed OAuth
    // `state` cookie on result.headers. Dropping it made every callback fail
    // with state_mismatch, because the state cookie never reached the browser.
    const result = await this.auth.api.signInSocial({
      body: {
        provider: "google",
        callbackURL: "/",
        // Without this Google silently reuses the account already signed in.
        additionalParams: addAccount ? { prompt: "select_account" } : undefined,
      },
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });
    for (const cookie of result.headers?.getSetCookie() ?? []) {
      response.append("Set-Cookie", cookie);
    }
    return { url: result.response?.url ?? "/" };
  }

  @Public()
  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    // Signs out every account on this browser. Set-Cookie must be forwarded
    // or the browser keeps cookies for sessions that no longer exist.
    const result = await this.auth.api
      .signOut({
        headers: fromNodeHeaders(request.headers),
        returnHeaders: true,
      })
      .catch(() => null);
    for (const cookie of result?.headers?.getSetCookie() ?? []) {
      response.append("Set-Cookie", cookie);
    }
    return { status: "logged out" };
  }

  @Public()
  @Get("me")
  async me(@Req() request: Request) {
    const session = await this.auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      throw new UnauthorizedException("Not logged in");
    }
    return {
      id: session.user.id,
      email: session.user.email,
      display_name: session.user.name,
    };
  }

  /** Never returns session tokens: they stay in HttpOnly cookies. */
  @Public()
  @Get("accounts")
  async accounts(@Req() request: Request) {
    const headers = fromNodeHeaders(request.headers);
    const session = await this.auth.api.getSession({ headers });
    if (!session) {
      throw new UnauthorizedException("Not logged in");
    }
    const others = (await this.auth.api.listDeviceSessions({ headers })).filter(
      (entry) => entry.user.id !== session.user.id,
    );
    const toAccount = (user: typeof session.user, active: boolean) => ({
      id: user.id,
      email: user.email,
      display_name: user.name,
      active,
    });
    return {
      accounts: [
        toAccount(session.user, true),
        ...others.map((entry) => toAccount(entry.user, false)),
      ],
    };
  }

  @Public()
  @Post("accounts/switch")
  async switchAccount(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body({ schema: switchAccountSchema })
    body: z.output<typeof switchAccountSchema>,
  ) {
    const headers = fromNodeHeaders(request.headers);
    const target = (await this.auth.api.listDeviceSessions({ headers })).find(
      (entry) => entry.user.id === body.user_id,
    );
    if (!target) {
      throw new NotFoundException("That account isn't signed in here.");
    }
    const result = await this.auth.api.setActiveSession({
      body: { sessionToken: target.session.token },
      headers,
      returnHeaders: true,
    });
    for (const cookie of result.headers?.getSetCookie() ?? []) {
      response.append("Set-Cookie", cookie);
    }
    return { status: "switched" };
  }

  /** Everything else under /api/auth/* is Better Auth (signin, callback, ok…). */
  @Public()
  @All("*path")
  async betterAuthProxy(
    @Req() request: Request,
    @Res({ passthrough: false }) response: Response,
  ) {
    const url = new URL(
      request.originalUrl ?? request.url,
      this.baseURL || "http://localhost",
    );
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (value != null) {
        headers.set(key, String(value));
      }
    }
    const method = request.method.toUpperCase();
    let body: string | undefined;
    if (!["GET", "HEAD"].includes(method) && request.body != null) {
      body = JSON.stringify(request.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
    const upstream = await this.auth.handler(
      new Request(url.toString(), {
        method,
        headers,
        body,
        redirect: "manual",
      }),
    );
    response.status(upstream.status);
    for (const cookie of upstream.headers.getSetCookie?.() ?? []) {
      response.append("Set-Cookie", cookie);
    }
    upstream.headers.forEach((value, key) => {
      if (key.toLowerCase() !== "set-cookie") {
        response.setHeader(key, value);
      }
    });
    const buffer = Buffer.from(await upstream.arrayBuffer());
    response.send(buffer);
  }

  private publicBaseUrl(request: Request): string {
    const override = this.redirectBaseURL;
    if (override) return stripTrailingSlashes(override);
    const proto =
      (request.headers["x-forwarded-proto"] as string) || request.protocol;
    const host = request.headers["x-forwarded-host"] || request.headers.host;
    return `${proto}://${host}`;
  }
}
