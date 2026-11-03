import { LlmError } from "./extract-json";

export { KNOWN_PROVIDERS, type ProviderName } from "./constants/llm.constants";

export interface LlmProvider {
  /** Any string: concrete providers use known names; test fakes may not. */
  readonly name: string;
  completeJson(prompt: string): Promise<Record<string, unknown>>;
}

/** Pulls the assistant text out of an OpenAI-style choices payload. */
export function contentFromChoices(payload: unknown, provider: string): string {
  const record = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = record?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new LlmError(
      `Unexpected ${provider} response: ${JSON.stringify(payload)}`,
    );
  }
  return content;
}
