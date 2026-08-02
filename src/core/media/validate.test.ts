import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES, sniffImageType, validateUpload } from "./validate";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

describe("sniffImageType", () => {
  it("identifies jpeg, png and webp by magic bytes", () => {
    expect(sniffImageType(jpeg)).toBe("jpeg");
    expect(sniffImageType(png)).toBe("png");
    expect(sniffImageType(webp)).toBe("webp");
  });

  /*
   * The declared Content-Type is attacker-controlled, so it is never consulted.
   * A renamed executable is the payload that matters: the file lands on disk
   * and is served back from our own origin.
   */
  it("rejects a renamed executable", () => {
    const exe = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sniffImageType(exe)).toBeNull();
  });

  /*
   * SVG is a real image format and is deliberately NOT on the allowlist: it can
   * carry script, and it would be served same-origin.
   */
  it("rejects SVG", () => {
    const svg = new TextEncoder().encode(
      "<svg xmlns='http://www.w3.org/2000/svg'></svg>",
    );
    expect(sniffImageType(svg)).toBeNull();
  });

  it("rejects a buffer too short to carry a signature", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  // RIFF alone is not WebP: WAV and AVI share the container.
  it("rejects RIFF that is not WEBP", () => {
    const wav = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45,
    ]);
    expect(sniffImageType(wav)).toBeNull();
  });
});

describe("validateUpload", () => {
  it("accepts a valid image under the cap", () => {
    expect(validateUpload(jpeg)).toEqual({ ok: true, type: "jpeg" });
  });

  it("rejects an empty upload", () => {
    expect(validateUpload(new Uint8Array(0)).ok).toBe(false);
  });

  it("rejects an upload over the cap", () => {
    const huge = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    huge.set(jpeg, 0);

    const result = validateUpload(huge);
    expect(result.ok).toBe(false);
    // Naming the actual limit is the actionable part: an owner can act on
    // "bigger than 8 MB" and cannot act on "too large".
    if (!result.ok) expect(result.reason).toMatch(/8 MB/);
  });

  /*
   * The owner is a restaurant owner on a phone, not an engineer. Every refusal
   * has to say what to do about it -- "Upload failed" generates a support call.
   */
  it("explains every refusal in plain language", () => {
    const cases = [new Uint8Array(0), new Uint8Array([0x4d, 0x5a, 0, 0])];

    for (const bytes of cases) {
      const result = validateUpload(bytes);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(10);
        expect(result.reason).not.toMatch(/error|invalid|failed/i);
      }
    }
  });
});
