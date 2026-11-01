import { Injectable } from "@nestjs/common";

import { LlmError } from "./extract-json";

/** Mirrors python RETRYABLE_STATUS / RETRY_DELAYS. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000];
const TIMEOUT_MS = 90_000;

export interface LlmHttpResponse {
  status: number;
  json: () => Promise<unknown>;
}

/**
 * JSON-POST with transient-error retries. Injectable so providers stay
 * thin and tests can stub it (or stub global fetch directly).
 */
@Injectable()
export class LlmHttpService {
  async postJson(
    url: string,
    headers: Record<string, string>,
    payload: unknown,
    retryDelays: number[] = DEFAULT_RETRY_DELAYS_MS,
  ): Promise<unknown> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!response.ok) {
          lastError = new LlmError(`HTTP ${response.status} from ${url}`);
          if (
            RETRYABLE_STATUS.has(response.status) &&
            attempt < retryDelays.length
          ) {
            await sleep(retryDelays[attempt]);
            continue;
          }
          break;
        }
        return (await response.json()) as unknown;
      } catch (error) {
        lastError = error;
        if (attempt < retryDelays.length) {
          await sleep(retryDelays[attempt]);
          continue;
        }
        break;
      }
    }
    throw new LlmError(
      `LLM request failed: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
