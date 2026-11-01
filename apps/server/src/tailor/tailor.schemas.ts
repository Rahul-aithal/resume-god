import { z } from "zod";

export const tailorRequestSchema = z.object({
  jd_text: z.string().min(1),
  target_title: z.optional(z.string()),
  max_achievements: z.optional(
    z.coerce.number().int().min(1).max(50).default(10),
  ),
  provider: z.optional(
    z.enum(["auto", "deterministic", "gemini", "glm", "openai"]),
  ),
  font: z.optional(z.string()),
  summary: z.optional(z.string()),
});

export const tailorJobRequestSchema = tailorRequestSchema.extend({
  company_id: z.optional(z.coerce.number().int().positive()),
  company_name: z.optional(z.string().trim().min(1)),
  job_url: z.optional(z.string()),
  role_status: z.optional(
    z.enum(["wishlist", "applied", "oa", "interview", "offer", "rejected"]),
  ),
});

export const tailorResponseSchema = z.object({
  plan: z.record(z.string(), z.unknown()),
  resume_data: z.record(z.string(), z.unknown()),
  validation: z.object({
    dropped_bullets: z.array(z.string()),
    fallback_bullets: z.array(z.string()),
    issues: z.array(z.string()),
  }),
  providers: z.record(
    z.string(),
    z.object({
      requested: z.string(),
      used: z.string(),
      fallback_error: z.string().nullable(),
    }),
  ),
});

export const reviewRequestSchema = z.object({
  plan: z.record(z.string(), z.unknown()),
  edits: z.object({
    rewritten_text: z.record(z.string(), z.string()),
    summary: z.nullish(z.string()),
  }),
  font: z.optional(z.string()),
});

export const renderTypstRequestSchema = z.object({
  resume_data: z.record(z.string(), z.unknown()),
});
