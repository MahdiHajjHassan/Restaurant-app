import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { processImage } from "@/core/media/process";

/**
 * The image pipeline, against real bytes.
 *
 * Integration rather than unit: these assertions are about what libvips
 * actually produces, and a mocked sharp would prove nothing about whether a
 * restaurant owner's GPS coordinates survive an upload.
 *
 * Fixtures come from `node scripts/make-image-fixtures.mjs`.
 */
let gpsTagged: Uint8Array;
let rotated: Uint8Array;

beforeAll(async () => {
  gpsTagged = new Uint8Array(await readFile("tests/fixtures/gps-tagged.jpg"));
  rotated = new Uint8Array(await readFile("tests/fixtures/rotated.jpg"));

  // Guards the guard: if the fixture lost its EXIF, the stripping test below
  // would pass without exercising anything.
  const meta = await sharp(Buffer.from(gpsTagged)).metadata();
  expect(meta.exif?.length ?? 0).toBeGreaterThan(100);
});

describe("processImage", () => {
  it("re-encodes to webp and reports real dimensions", async () => {
    const out = await processImage(gpsTagged);

    expect(out.contentType).toBe("image/webp");
    expect(out.width).toBe(800);
    expect(out.height).toBe(600);

    const meta = await sharp(Buffer.from(out.data)).metadata();
    expect(meta.format).toBe("webp");
  });

  /*
   * The privacy promise, verified rather than commented.
   *
   * Restaurant owners photograph their own premises on their own phones, and
   * those files carry the coordinates of where they work and often where they
   * live. Publishing that on a public menu page is the kind of harm you cannot
   * take back once it is indexed.
   */
  it("strips EXIF GPS from the output", async () => {
    const out = await processImage(gpsTagged);

    const meta = await sharp(Buffer.from(out.data)).metadata();
    expect(meta.exif).toBeUndefined();
  });

  /*
   * Orientation must be applied BEFORE metadata is discarded. Skip the rotate
   * and every portrait phone photo comes out on its side, with the tag that
   * would have fixed it now gone -- the classic version of this bug.
   */
  it("applies EXIF orientation before discarding it", async () => {
    const out = await processImage(rotated);

    // Orientation 6 is "rotate 90 CW", so a 400x800 source lands 800x400.
    expect(out.width).toBe(800);
    expect(out.height).toBe(400);
  });

  it("bounds a large image without enlarging a small one", async () => {
    const big = new Uint8Array(
      await sharp({
        create: { width: 4000, height: 3000, channels: 3, background: "#000" },
      })
        .jpeg()
        .toBuffer(),
    );
    const bigOut = await processImage(big);
    expect(bigOut.width).toBe(1600);
    expect(bigOut.height).toBe(1200);

    const small = new Uint8Array(
      await sharp({
        create: { width: 200, height: 150, channels: 3, background: "#000" },
      })
        .jpeg()
        .toBuffer(),
    );
    const smallOut = await processImage(small);
    expect(smallOut.width).toBe(200);
    expect(smallOut.height).toBe(150);
  });

  it("produces an inline blur placeholder", async () => {
    const out = await processImage(gpsTagged);

    expect(out.blurDataUrl).toMatch(/^data:image\/webp;base64,/);
    // Must stay small enough to inline in the document without bloating it --
    // it ships in the HTML of every menu page that has photos.
    expect(out.blurDataUrl.length).toBeLessThan(2000);
  });

  it("rejects bytes that are not an image", async () => {
    const notAnImage = new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0, 0, 0, 0]);
    await expect(processImage(notAnImage)).rejects.toThrow();
  });
});
