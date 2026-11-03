import { z } from "zod";

// ---- responses ----

export const apiKeysResponseSchema = z.object({
  keys: z.array(
    z.object({
      provider: z.string(),
      source: z.enum(["user", "server", "none"]),
      last4: z.nullable(z.string()),
      needs_reentry: z.boolean(),
    }),
  ),
});

export const userSettingsResponseSchema = z.object({
  llm_order: z.string(),
  gemini_model: z.string(),
  glm_model: z.string(),
  openai_model: z.string(),
  default_font: z.string(),
});

export const providersStatusResponseSchema = z.object({
  order: z.array(z.string()),
  auto: z.string(),
  models: z.object({
    gemini: z.string(),
    glm: z.string(),
    openai: z.string(),
  }),
  default_font: z.string(),
});
