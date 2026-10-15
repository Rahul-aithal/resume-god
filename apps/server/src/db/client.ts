import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import { resolve } from "node:path";
import postgres from "postgres";

import * as schema from "./schema";

export type AppDb = ReturnType<typeof drizzle<typeof schema>>;

export function databaseUrl(explicit?: string): string {
  const candidate = explicit ?? process.env.DATABASE_URL;
  if (!candidate || !candidate.trim()) {
    throw new Error(
      "DATABASE_URL is required. Set it to your Postgres connection string, " +
        "e.g. postgresql://resume_god:resume-god-local@localhost:5432/resume_god",
    );
  }
  return candidate.trim();
}

/**
 * Memoized on globalThis (not module scope): Bun can evaluate this module
 * twice when dynamic imports enter the graph (tests import the app module
 * dynamically), which would otherwise open extra connections.
 */
const globalStore = globalThis as unknown as {
  __resumeGodDb?: AppDb;
  __resumeGodDbUrl?: string;
};

/** Synchronous: postgres.js connects lazily on first query. */
export function getDb(explicitUrl?: string): AppDb {
  const url = databaseUrl(explicitUrl);
  if (globalStore.__resumeGodDb && globalStore.__resumeGodDbUrl === url) {
    return globalStore.__resumeGodDb;
  }
  const client = postgres(url, { max: 10 });
  const db = drizzle(client, { schema });
  globalStore.__resumeGodDb = db;
  globalStore.__resumeGodDbUrl = url;
  return db;
}

/** Applies pending migrations. Call once at startup (main.ts, tests). */
export async function migrateDb(explicitUrl?: string): Promise<void> {
  const db = getDb(explicitUrl);
  // src/db -> ../../drizzle == apps/server/drizzle (same depth in dist/).
  await migrate(db, {
    migrationsFolder: resolve(import.meta.dir, "../../drizzle"),
  });
}

/** Truncate every table (tests only): FK-safe via CASCADE. */
export async function truncateAll(db: AppDb): Promise<void> {
  const tables = [
    "kg_achievement_metrics",
    "kg_achievement_skills",
    "kg_achievements",
    "kg_skill_aliases",
    "kg_skill_implies",
    "kg_skills",
    "kg_soft_skills",
    "kg_parents",
    "kg_education",
    "kg_certifications",
    "kg_contact",
    "applications",
    "artifacts",
    "roles",
    "companies",
    "user_settings",
    "auth_verification",
    "auth_session",
    "auth_account",
    "auth_user",
  ];
  await db.execute(
    `TRUNCATE ${tables.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}
