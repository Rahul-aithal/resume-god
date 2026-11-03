import { z } from "zod";

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
