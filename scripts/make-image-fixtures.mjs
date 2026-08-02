import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

/*
 * Generates the image fixtures the media tests need.
 *
 * Generated rather than committed so the repository carries no binaries of
 * unknown provenance, and so the fixtures can be regenerated on any machine.
 *
 * Run: node scripts/make-image-fixtures.mjs
 */

await mkdir("tests/fixtures", { recursive: true });

/*
 * A JPEG carrying EXIF GPS coordinates.
 *
 * This is the fixture the privacy promise rests on: if sharp ever stops
 * writing the GPS block, the stripping test would pass without proving
 * anything, so the byte count is asserted here at generation time.
 */
const gpsTagged = await sharp({
  create: { width: 800, height: 600, channels: 3, background: "#c8102e" },
})
  .withExif({
    IFD0: { Copyright: "Test Restaurant" },
    GPS: {
      GPSLatitudeRef: "N",
      GPSLatitude: "33/1 53/1 0/1",
      GPSLongitudeRef: "E",
      GPSLongitude: "35/1 30/1 0/1",
    },
  })
  .jpeg()
  .toBuffer();

const gpsMeta = await sharp(gpsTagged).metadata();
if (!gpsMeta.exif || gpsMeta.exif.length < 100) {
  throw new Error(
    `Fixture carries no usable EXIF (${gpsMeta.exif?.length ?? 0} bytes). ` +
      "The GPS-stripping test would pass vacuously against it.",
  );
}

await writeFile("tests/fixtures/gps-tagged.jpg", gpsTagged);

/*
 * Portrait content tagged orientation 6 ("rotate 90 degrees clockwise").
 *
 * Re-encoding discards EXIF, so a pipeline that does not apply orientation
 * FIRST leaves every portrait phone photo on its side with the tag that would
 * have corrected it now gone.
 */
const rotated = await sharp({
  create: { width: 400, height: 800, channels: 3, background: "#1c3f6e" },
})
  .withMetadata({ orientation: 6 })
  .jpeg()
  .toBuffer();

const rotatedMeta = await sharp(rotated).metadata();
if (rotatedMeta.orientation !== 6) {
  throw new Error(
    `Fixture orientation is ${rotatedMeta.orientation}, expected 6. ` +
      "The orientation test would prove nothing against it.",
  );
}

await writeFile("tests/fixtures/rotated.jpg", rotated);

console.log(
  `Wrote tests/fixtures/gps-tagged.jpg (${gpsMeta.exif.length} EXIF bytes) ` +
    `and tests/fixtures/rotated.jpg (orientation ${rotatedMeta.orientation}).`,
);
