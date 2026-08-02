import { describe, expect, it } from "vitest";
import { CSS_VARIABLE, isHexColor, THEME_TOKENS } from "./tokens";

describe("isHexColor", () => {
  it("accepts six-digit hex in either case", () => {
    expect(isHexColor("#3f5d3a")).toBe(true);
    expect(isHexColor("#3F5D3A")).toBe(true);
  });

  /*
   * These are the values that would end up inside a CSS declaration. Every one
   * of them is a way an owner-supplied string could stop being a colour and
   * start being syntax, so each is named explicitly rather than covered by a
   * vague "rejects invalid input" case.
   */
  it.each([
    ["#fff", "three-digit shorthand"],
    ["red", "named colour"],
    ["rgb(0,0,0)", "functional notation"],
    ["#3f5d3a80", "alpha channel"],
    ["#000;} body{background:url(x)", "declaration break-out"],
    ["#00000\n", "trailing newline"],
    ["", "empty"],
  ])("rejects %s (%s)", (value) => {
    expect(isHexColor(value)).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(0x3f5d3a)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });
});

describe("token contract", () => {
  it("maps every token to a CSS custom property", () => {
    for (const token of THEME_TOKENS) {
      expect(CSS_VARIABLE[token]).toMatch(/^--color-/);
    }
  });

  it("has no duplicate CSS variable names", () => {
    const names = THEME_TOKENS.map((t) => CSS_VARIABLE[t]);
    expect(new Set(names).size).toBe(names.length);
  });
});
