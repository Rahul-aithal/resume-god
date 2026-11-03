export type ProviderName = "gemini" | "glm" | "openai";

export const KNOWN_PROVIDERS: ProviderName[] = ["gemini", "glm", "openai"];
export const DEFAULT_PROVIDER_ORDER: ProviderName[] = [...KNOWN_PROVIDERS];

export const LLM_RETRYABLE_STATUS = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);
export const LLM_RETRY_DELAYS_MS = [1000, 2000, 4000];
export const LLM_TIMEOUT_MS = 90_000;
