import { describe, expect, it } from "bun:test";

import {
  firstNonEmpty,
  splitList,
  stripTrailingSlashes,
} from "../src/config/env-utils";

describe("env-utils", () => {
  it("splitList trims, drops empties, handles undefined", () => {
    expect(splitList("gemini, glm,,openai ")).toEqual([
      "gemini",
      "glm",
      "openai",
    ]);
    expect(splitList(undefined)).toEqual([]);
    expect(splitList("")).toEqual([]);
  });

  it("firstNonEmpty returns the first non-blank value", () => {
    expect(firstNonEmpty(undefined, "", "  ", "b", "c")).toBe("b");
    expect(firstNonEmpty(undefined, "")).toBe("");
  });

  it("stripTrailingSlashes removes trailing slashes only", () => {
    expect(stripTrailingSlashes("https://x.com///")).toBe("https://x.com");
    expect(stripTrailingSlashes("https://x.com")).toBe("https://x.com");
  });
});
