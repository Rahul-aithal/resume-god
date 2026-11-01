import { z } from "zod";

import { KNOWN_PROVIDERS } from "../llm/llm-provider.interface";

/** Normalizes "Gemini , GLM " → "gemini,glm" and enforces the provider set. */
export const providerOrderSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
      .join(","),
  )
  .check((ctx) => {
    const items = ctx.value.split(",").filter(Boolean);
    if (items.length === 0) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        // The pipe prefixes the path ("llm_order: ..."), so keep it short.
        message: "cannot be empty",
      });
      return;
    }
    const invalid = items.filter(
      (item) => !(KNOWN_PROVIDERS as readonly string[]).includes(item),
    );
    if (invalid.length > 0) {
      ctx.issues.push({
        code: "custom",
        input: ctx.value,
        message: `unknown providers: ${invalid.join(", ")} (use ${KNOWN_PROVIDERS.join("/")})`,
      });
    }
  });

export const updateSettingsSchema = z.strictObject({
  llm_order: z.optional(providerOrderSchema),
  gemini_model: z.optional(z.string().min(1)),
  glm_model: z.optional(z.string().min(1)),
  openai_model: z.optional(z.string().min(1)),
  default_font: z.optional(z.string().min(1)),
});

export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;

export const saveApiKeySchema = z.strictObject({
  api_key: z
    .string()
    .trim()
    .min(8, { error: "That key looks too short" })
    .max(512, { error: "That key looks too long" })
    .regex(/^\S+$/, { error: "API keys can't contain spaces" }),
});

export type SaveApiKeyInput = z.output<typeof saveApiKeySchema>;

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

// ---- responses ----

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
