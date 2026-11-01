import { describe, expect, it } from "bun:test";

import {
  LlmError,
  balancedObjectSpans,
  extractJsonObject,
} from "../src/llm/extract-json";

describe("extractJsonObject", () => {
  it("parses a plain object", () => {
    expect(extractJsonObject('{"a": 1}')).toEqual({ a: 1 });
  });

  it("parses fenced, prose-wrapped responses", () => {
    const text =
      'Here is the result:\n```json\n{"selected": ["x"]}\n```\nHope this helps!';
    expect(extractJsonObject(text)).toEqual({ selected: ["x"] });
  });

  it("ignores braces in strings and picks the first object", () => {
    const text = 'note { not json } then {"b": "a { c }"} trailing {oops';
    expect(extractJsonObject(text)).toEqual({ b: "a { c }" });
  });

  it("rejects arrays and prose", () => {
    expect(() => extractJsonObject("[]")).toThrow(LlmError);
    expect(() => extractJsonObject("no braces here")).toThrow(LlmError);
  });
});

describe("balancedObjectSpans", () => {
  it("handles nested braces and escapes", () => {
    const spans = balancedObjectSpans('{"a": {"b": 1}, "c": "x}y\\"z"} tail');
    expect(spans).toHaveLength(1);
    expect(JSON.parse(spans[0])).toEqual({ a: { b: 1 }, c: 'x}y"z' });
  });
});
