import { Injectable } from "@nestjs/common";

import { LlmError } from "./extract-json";
import {
  LLM_RETRY_DELAYS_MS,
  LLM_RETRYABLE_STATUS,
  LLM_TIMEOUT_MS,
} from "./constants/llm.constants";

/** Mirrors python LLM_RETRYABLE_STATUS / RETRY_DELAYS. */

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
    retryDelays: number[] = LLM_RETRY_DELAYS_MS,
  ): Promise<unknown> {
    let lastError: unknown = null;
    for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
        });
        if (!response.ok) {
          lastError = new LlmError(`HTTP ${response.status} from ${url}`);
          if (
            LLM_RETRYABLE_STATUS.has(response.status) &&
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
