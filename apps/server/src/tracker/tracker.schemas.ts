import { z } from "zod";

export const ROLE_STATUSES = [
  "wishlist",
  "applied",
  "oa",
  "interview",
  "offer",
  "rejected",
] as const;

export const roleStatusSchema = z.enum(ROLE_STATUSES, {
  // The pipe prefixes the path ("status: ..."), so the message stays short.
  error: (issue) =>
    `unknown status: ${issue.input} (use ${ROLE_STATUSES.join(", ")})`,
});

const optionalText = z.optional(z.string());

// ---- requests ----

export const createCompanySchema = z.strictObject({
  name: z.string().trim().min(1, { error: "Company name is required" }),
  website: optionalText,
  location: optionalText,
  about: optionalText,
  notes: optionalText,
});

export const createRoleSchema = z.strictObject({
  company_id: z.coerce.number().int().positive(),
  target_title: z.string().trim().min(1, { error: "Target title is required" }),
  status: z.optional(roleStatusSchema),
  job_url: optionalText,
  salary: optionalText,
  location: optionalText,
  notes: optionalText,
});

export const updateRoleSchema = z.strictObject({
  status: z.optional(roleStatusSchema),
  job_url: optionalText,
  salary: optionalText,
  location: optionalText,
  notes: optionalText,
});

export const listRolesQuerySchema = z.object({
  company_id: z.optional(z.coerce.number().int().positive()),
  status: z.optional(z.string()),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export const companyIdParamSchema = z.coerce.number().int().positive();
export const roleIdParamSchema = z.coerce.number().int().positive();
export type CreateCompanyInput = z.output<typeof createCompanySchema>;
export type CreateRoleInput = z.output<typeof createRoleSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;
export type ListRolesQuery = z.output<typeof listRolesQuerySchema>;

// ---- responses (mirrors tracker.repository mappers) ----

const isoDate = z.string().nullable();

export const companyResponseSchema = z.object({
  id: z.number(),
  name: z.string(),
  website: z.string(),
  location: z.string(),
  about: z.string(),
  notes: z.string(),
  role_count: z.number(),
  created_at: isoDate,
  updated_at: isoDate,
});

export const roleResponseSchema = z.object({
  id: z.number(),
  company_id: z.number(),
  target_title: z.string(),
  status: z.string(),
  job_url: z.string(),
  salary: z.string(),
  location: z.string(),
  notes: z.string(),
  created_at: isoDate,
});

export const roleWithCompanyResponseSchema = roleResponseSchema.extend({
  company_name: z.string(),
});

export const companyDetailResponseSchema = companyResponseSchema.extend({
  roles: z.array(roleWithCompanyResponseSchema),
  by_status: z.record(z.string(), z.number()),
});

export const companiesListResponseSchema = z.object({
  companies: z.array(companyResponseSchema),
});

export const rolesListResponseSchema = z.object({
  roles: z.array(roleWithCompanyResponseSchema),
});

export const roleMutationResponseSchema = roleResponseSchema;

export const roleHistoryResponseSchema = z.object({
  role: roleResponseSchema,
  history: z.array(
    z.object({
      id: z.number(),
      role_id: z.number(),
      status: z.string(),
      job_url: z.string(),
      salary: z.string(),
      location: z.string(),
      applied_on: z.string(),
      notes: z.string(),
      created_at: isoDate,
    }),
  ),
});

export const dashboardResponseSchema = z.object({
  company_count: z.number(),
  role_count: z.number(),
  by_status: z.record(z.string(), z.number()),
  recent_roles: z.array(roleWithCompanyResponseSchema),
  recent_artifacts: z.array(
    z.object({
      id: z.number(),
      kind: z.string(),
      path: z.string(),
      created_at: isoDate,
    }),
  ),
});
