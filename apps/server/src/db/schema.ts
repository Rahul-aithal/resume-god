import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { mode: "date" });
const now = () => new Date();

// ---- Better Auth tables (model names: user/session/account/verification) ----

export const authUser = pgTable("auth_user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

export const authSession = pgTable(
  "auth_session",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: ts("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("auth_session_user_idx").on(table.userId)],
);

export const authAccount = pgTable(
  "auth_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: ts("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("auth_account_user_idx").on(table.userId)],
);

export const authVerification = pgTable("auth_verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---- App tables (mirrors apps/api resume_god/db.py; user_id is text now) ----

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    website: text("website").notNull().default(""),
    location: text("location").notNull().default(""),
    about: text("about").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: ts("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("companies_user_name_uq").on(table.userId, table.name),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    targetTitle: text("target_title").notNull(),
    status: text("status").notNull().default("applied"),
    jobUrl: text("job_url").notNull().default(""),
    salary: text("salary").notNull().default(""),
    location: text("location").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("roles_company_title_uq").on(
      table.companyId,
      table.targetTitle,
    ),
    index("roles_user_idx").on(table.userId),
  ],
);

export const applications = pgTable(
  "applications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("applied"),
    jobUrl: text("job_url").notNull().default(""),
    salary: text("salary").notNull().default(""),
    location: text("location").notNull().default(""),
    jdText: text("jd_text").notNull().default(""),
    resumePdf: text("resume_pdf").notNull().default(""),
    planJson: text("plan_json").notNull().default(""),
    appliedOn: text("applied_on").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [index("applications_role_idx").on(table.roleId)],
);

export const artifacts = pgTable("artifacts", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  roleId: integer("role_id").references(() => roles.id, {
    onDelete: "set null",
  }),
  kind: text("kind").notNull(),
  path: text("path").notNull(),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

// ---- Knowledge graph (normalized; the profile file is transport, not storage) ----

/** Skills: semantic slug ids unique per user (e.g. "skill_golang"). */
export const kgSkills = pgTable(
  "kg_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("kg_skills_name_idx").on(table.userId, table.name),
  ],
);

export const kgSkillAliases = pgTable(
  "kg_skill_aliases",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    alias: text("alias").notNull(),
  },
  (table) => [
    index("kg_skill_aliases_skill_idx").on(table.userId, table.skillId),
  ],
);

/** Experiences and projects: the parents achievements hang off. */
export const kgParents = pgTable(
  "kg_parents",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    kind: text("kind").notNull(), // 'experience' | 'project'
    name: text("name").notNull(),
    title: text("title").notNull().default(""),
    url: text("url").notNull().default(""),
    dateRange: text("date_range").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("kg_parents_user_kind_idx").on(table.userId, table.kind),
  ],
);

export const kgAchievements = pgTable(
  "kg_achievements",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    parentId: text("parent_id").notNull(),
    text: text("text").notNull(),
    dateRange: text("date_range").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("kg_achievements_parent_idx").on(table.userId, table.parentId),
    foreignKey({
      name: "kg_achievements_parent_fk",
      columns: [table.userId, table.parentId],
      foreignColumns: [kgParents.userId, kgParents.id],
    }).onDelete("cascade"),
  ],
);

export const kgAchievementMetrics = pgTable(
  "kg_achievement_metrics",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    sort: integer("sort").notNull().default(0),
    value: text("value").notNull(),
  },
  (table) => [
    index("kg_achievement_metrics_a_idx").on(table.userId, table.achievementId),
  ],
);

/** DEMONSTRATES edges: achievement → skill. */
export const kgAchievementSkills = pgTable(
  "kg_achievement_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    skillId: text("skill_id").notNull(),
  },
  (table) => [
    index("kg_achievement_skills_a_idx").on(table.userId, table.achievementId),
    index("kg_achievement_skills_s_idx").on(table.userId, table.skillId),
  ],
);

/** IMPLIES edges: framework → foundation (per-user, editable). */
export const kgSkillImplies = pgTable(
  "kg_skill_implies",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    fromSkillId: text("from_skill_id").notNull(),
    toSkillId: text("to_skill_id").notNull(),
  },
  (table) => [
    uniqueIndex("kg_skill_implies_uq").on(
      table.userId,
      table.fromSkillId,
      table.toSkillId,
    ),
  ],
);

export const kgEducation = pgTable(
  "kg_education",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    institution: text("institution").notNull(),
    credential: text("credential").notNull().default(""),
    dateRange: text("date_range").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const kgCertifications = pgTable(
  "kg_certifications",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    issuer: text("issuer").notNull().default(""),
    issuedOn: text("issued_on").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

/** Optional contact override; falls back to auth user name/email. */
export const kgContact = pgTable("kg_contact", {
  userId: text("user_id")
    .primaryKey()
    .references(() => authUser.id, { onDelete: "cascade" }),
  location: text("location").notNull().default(""),
  phone: text("phone").notNull().default(""),
  email: text("email").notNull().default(""),
  linkedin: text("linkedin").notNull().default(""),
  github: text("github").notNull().default(""),
  personalSite: text("personal_site").notNull().default(""),
  updatedAt: ts("updated_at").notNull().$defaultFn(now),
});

export const kgSoftSkills = pgTable(
  "kg_soft_skills",
  {
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    name: text("name").notNull(),
    detail: text("detail").notNull().default(""),
    createdAt: ts("created_at").notNull().$defaultFn(now),
    updatedAt: ts("updated_at").notNull().$defaultFn(now),
  },
  (table) => [primaryKey({ columns: [table.userId, table.id] })],
);

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => authUser.id, { onDelete: "cascade" }),
  llmOrder: text("llm_order").notNull().default("gemini,glm,openai"),
  geminiModel: text("gemini_model").notNull().default("gemini-3-flash-preview"),
  glmModel: text("glm_model").notNull().default("glm-4.6"),
  openaiModel: text("openai_model").notNull().default("gpt-4.1"),
  defaultFont: text("default_font").notNull().default("Calibri"),
  /** Render gate: tailoring/PDF output requires a reviewed graph. */
  reviewedAt: ts("reviewed_at"),
  createdAt: ts("created_at")
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: ts("updated_at")
    .notNull()
    .$defaultFn(() => new Date()),
});

/** Bring-your-own LLM keys. Only ciphertext is stored; see api-key-crypto.ts. */
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    ciphertext: text("ciphertext").notNull(),
    last4: text("last4").notNull(),
    createdAt: ts("created_at")
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: ts("updated_at")
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_api_keys_user_provider_idx").on(
      table.userId,
      table.provider,
    ),
  ],
);
