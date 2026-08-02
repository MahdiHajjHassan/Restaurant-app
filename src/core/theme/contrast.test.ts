import { describe, expect, it } from "vitest";
import { contrastRatio, relativeLuminance, validatePalette } from "./contrast";
import type { Palette } from "./tokens";

describe("relativeLuminance", () => {
  // WCAG reference values. Black is 0, white is 1, by definition.
  it("anchors at black and white", () => {
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 5);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
  });

  it("uses the linear segment below the 0.04045 threshold", () => {
    // #030303 is 3/255 = 0.0118, under the threshold, so it divides by 12.92
    // rather than taking the power curve. Getting this branch wrong shifts
    // every dark-palette ratio.
    expect(relativeLuminance("#030303")).toBeCloseTo(0.000911, 5);
  });
});

describe("contrastRatio", () => {
  it("returns 21 for black on white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2);
  });

  it("is symmetric — order of arguments does not matter", () => {
    expect(contrastRatio("#1a1a17", "#fbfaf7")).toBeCloseTo(
      contrastRatio("#fbfaf7", "#1a1a17"),
      10,
    );
  });

  it("returns 1 for a colour against itself", () => {
    expect(contrastRatio("#3f5d3a", "#3f5d3a")).toBeCloseTo(1, 10);
  });
});

const READABLE: Palette = {
  paper: "#fbfaf7",
  paperSunk: "#f1efe9",
  ink: "#1a1a17",
  muted: "#6e6a5f",
  rule: "#ddd9cf",
  accent: "#3f5d3a",
  onAccent: "#fbfaf7",
};

describe("validatePalette", () => {
  it("passes a readable palette with no issues", () => {
    expect(validatePalette(READABLE)).toEqual([]);
  });

  it("blocks unreadable body text", () => {
    const issues = validatePalette({ ...READABLE, ink: "#d8d8d8" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "ink",
        background: "paper",
        severity: "block",
      }),
    );
  });

  /*
   * The rule that earns its keep. Owners pick a surface they like, never touch
   * `muted`, and silently render every description and every price caption
   * unreadable. It has to block, not warn.
   */
  it("blocks unreadable secondary text", () => {
    const issues = validatePalette({ ...READABLE, muted: "#cfcdc6" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "muted",
        background: "paper",
        severity: "block",
      }),
    );
  });

  it("blocks unreadable text on an accent fill", () => {
    const issues = validatePalette({ ...READABLE, onAccent: "#4a6b45" });
    expect(issues).toContainEqual(
      expect.objectContaining({
        foreground: "onAccent",
        background: "accent",
        severity: "block",
      }),
    );
  });

  /*
   * Accent carries focus rings and links — non-text UI, so 3:1 and a warning.
   *
   * onAccent has to move to a dark ink in the same breath. A pale accent is low
   * contrast against pale paper (which is the point of this case), but the
   * default near-white onAccent sitting ON that pale accent is genuinely
   * unreadable and blocks — so leaving it alone tests the wrong rule.
   */
  it("warns but does not block on a low-contrast accent", () => {
    const issues = validatePalette({
      ...READABLE,
      accent: "#d4cec2",
      onAccent: "#1a1a17",
    });
    const accentIssue = issues.find((i) => i.foreground === "accent");
    expect(accentIssue?.severity).toBe("warn");
    expect(issues.some((i) => i.severity === "block")).toBe(false);
  });

  it("reports the measured ratio and the requirement", () => {
    const [issue] = validatePalette({ ...READABLE, ink: "#ffffff" });
    expect(issue.ratio).toBeCloseTo(1.0, 1);
    expect(issue.required).toBe(4.5);
  });
});
