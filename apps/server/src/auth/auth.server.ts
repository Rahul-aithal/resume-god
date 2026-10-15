import { Injectable } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import type { AppDb } from "../db/client";
import {
  authAccount,
  authSession,
  authUser,
  authVerification,
} from "../db/schema";

export type AuthInstance = ReturnType<typeof createAuth>;

export interface AuthOptions {
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  google: { clientId: string; clientSecret: string };
}

/**
 * Injectable wrapper around the Better Auth instance. Constructed via a
 * factory in AppModule; consumers inject this CLASS (never the raw
 * instance) so Bun's decorator metadata can resolve the dependency.
 */
@Injectable()
export class AuthHandle {
  constructor(private readonly instance: AuthInstance) {}

  get api() {
    return this.instance.api;
  }

  get handler() {
    return this.instance.handler;
  }
}

export function createAuth(db: AppDb, options: AuthOptions) {
  const baseURL = options.baseURL;
  return betterAuth({
    appName: "resume-god",
    baseURL: baseURL || undefined,
    trustedOrigins: [
      ...new Set(
        [
          baseURL,
          "http://localhost:5173",
          "http://localhost:3000",
          "http://localhost:8080",
          ...options.trustedOrigins,
        ].filter(Boolean),
      ),
    ],
    secret: options.secret || undefined,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: authUser,
        session: authSession,
        account: authAccount,
        verification: authVerification,
      },
    }),
    socialProviders: options.google.clientId
      ? {
          google: {
            clientId: options.google.clientId,
            clientSecret: options.google.clientSecret,
          },
        }
      : {},
  });
}
