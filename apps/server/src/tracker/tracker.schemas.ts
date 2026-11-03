import { z } from "zod";

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
