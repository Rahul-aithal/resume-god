import { z } from "zod";

// ---- requests ----

export const skillCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  name: z.string().trim().min(1, { error: "Skill name is required" }),
  category: z.optional(z.string()),
  aliases: z.optional(z.array(z.string().trim().min(1))),
});

export const skillUpdateSchema = z.strictObject({
  name: z.optional(
    z.string().trim().min(1, { error: "Skill name is required" }),
  ),
  category: z.optional(z.string()),
  aliases: z.optional(z.array(z.string().trim().min(1))),
});

export const parentCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  kind: z.enum(["experience", "project"]),
  name: z.string().trim().min(1, { error: "Name is required" }),
  title: z.optional(z.string()),
  url: z.optional(z.string()),
  date_range: z.optional(z.string()),
});

export const parentUpdateSchema = z.strictObject({
  name: z.optional(z.string().trim().min(1, { error: "Name is required" })),
  title: z.optional(z.string()),
  url: z.optional(z.string()),
  date_range: z.optional(z.string()),
});

export const achievementCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  parent_id: z.string().min(1),
  text: z.string().trim().min(1, { error: "Achievement text is required" }),
  date_range: z.optional(z.string()),
  skills: z.optional(z.array(z.string().min(1))),
  metrics: z.optional(z.array(z.string())),
});

export const achievementUpdateSchema = z.strictObject({
  parent_id: z.optional(z.string().min(1)),
  text: z.optional(
    z.string().trim().min(1, { error: "Achievement text is required" }),
  ),
  date_range: z.optional(z.string()),
  skills: z.optional(z.array(z.string().min(1))),
  metrics: z.optional(z.array(z.string())),
});

export const educationCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  institution: z.string().trim().min(1, { error: "Institution is required" }),
  credential: z.optional(z.string()),
  date_range: z.optional(z.string()),
});

export const educationUpdateSchema = z.strictObject({
  institution: z.optional(
    z.string().trim().min(1, { error: "Institution is required" }),
  ),
  credential: z.optional(z.string()),
  date_range: z.optional(z.string()),
});

export const certificationCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  name: z.string().trim().min(1, { error: "Name is required" }),
  issuer: z.optional(z.string()),
  issued_on: z.optional(z.string()),
});

export const certificationUpdateSchema = z.strictObject({
  name: z.optional(z.string().trim().min(1, { error: "Name is required" })),
  issuer: z.optional(z.string()),
  issued_on: z.optional(z.string()),
});

export const impliesEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
});

export const graphSearchQuerySchema = z.object({
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(5),
});

export const exploreQuerySchema = z.object({
  hops: z.coerce.number().int().min(1).max(2).default(2),
});

export const contactUpdateSchema = z.strictObject({
  location: z.optional(z.string()),
  phone: z.optional(z.string()),
  email: z.optional(z.string().trim().email({ message: "Invalid email" })),
  linkedin: z.optional(z.string()),
  github: z.optional(z.string()),
  personal_site: z.optional(z.string()),
});

export const softSkillCreateSchema = z.strictObject({
  id: z.optional(z.string().regex(/^[a-z0-9_]+$/)),
  name: z.string().trim().min(1, { error: "Name is required" }),
  detail: z.optional(z.string()),
});

export const softSkillUpdateSchema = z.strictObject({
  name: z.optional(z.string().trim().min(1, { error: "Name is required" })),
  detail: z.optional(z.string()),
});

export const graphImportSchema = z.object({
  format: z.enum(["yaml", "json"]).default("yaml"),
  content: z.string().min(1),
  mode: z.enum(["replace", "merge"]).default("replace"),
});

// ---- responses ----

const isoDate = z.string().nullable();

export const graphNodeSchema = z.object({
  id: z.string(),
  kind: z.enum([
    "skill",
    "experience",
    "project",
    "achievement",
    "education",
    "certification",
  ]),
  label: z.string(),
  detail: z.string().default(""),
});

export const graphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  type: z.enum(["USES", "PART_OF", "DEMONSTRATES", "IMPLIES"]),
});

export const graphProjectionSchema = z.object({
  reviewed_at: isoDate,
  nodes: z.array(graphNodeSchema),
  edges: z.array(graphEdgeSchema),
  stats: z.object({
    skills: z.number(),
    parents: z.number(),
    achievements: z.number(),
    education: z.number(),
    certifications: z.number(),
    edges: z.number(),
  }),
});

export const skillResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  aliases: z.array(z.string()),
});

export const parentResponseSchema = z.object({
  id: z.string(),
  kind: z.enum(["experience", "project"]),
  name: z.string(),
  title: z.string(),
  url: z.string(),
  date_range: z.string(),
});

export const achievementResponseSchema = z.object({
  id: z.string(),
  parent_id: z.string(),
  text: z.string(),
  date_range: z.string(),
  skills: z.array(z.string()),
  metrics: z.array(z.string()),
});

export const educationResponseSchema = z.object({
  id: z.string(),
  institution: z.string(),
  credential: z.string(),
  date_range: z.string(),
});

export const certificationResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  issuer: z.string(),
  issued_on: z.string(),
});

export const searchResponseSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      parent_name: z.string(),
      skills: z.array(z.string()),
      similarity: z.number(),
    }),
  ),
});

export const reviewResponseSchema = z.object({
  reviewed: z.boolean(),
  reviewed_at: isoDate,
});

export const contactResponseSchema = z.object({
  name: z.string(),
  location: z.string(),
  phone: z.string(),
  email: z.string(),
  linkedin: z.string(),
  github: z.string(),
  personal_site: z.string(),
  source: z.enum(["profile", "account"]),
});

export const softSkillResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  detail: z.string(),
});
