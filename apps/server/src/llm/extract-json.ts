/**
 * Extracts the first JSON object from a model response.
 *
 * Port of resume_god/llm.py _balanced_object_spans + _extract_json:
 * handles fenced ```json blocks, braces inside strings, escapes, and
 * prose around the payload. Throws LlmError when nothing parses.
 */

export class LlmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmError";
  }
}

/** Yields candidate {...} spans with correct brace/string/escape handling. */
export function balancedObjectSpans(text: string): string[] {
  const spans: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}") {
      if (depth > 0) {
        depth -= 1;
        if (depth === 0 && start >= 0) {
          spans.push(text.slice(start, index + 1));
          start = -1;
        }
      }
    }
  }
  return spans;
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  for (const span of balancedObjectSpans(candidate)) {
    try {
      const value = JSON.parse(span);
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value)
      ) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate span.
    }
  }
  throw new LlmError("Model response did not contain a JSON object");
}
