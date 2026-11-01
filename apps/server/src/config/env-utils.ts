/** Pure env-parsing helpers. No process access, no Nest — unit-testable. */

export function splitList(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/** First non-blank value wins (cross-variable fallback chains). */
export function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}
