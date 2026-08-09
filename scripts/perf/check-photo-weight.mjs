/**
 * Runs the generator through the real upload pipeline and prints what lands on
 * disk. This is the test that keeps the whole measurement honest: if these
 * numbers are small, every Lighthouse score downstream is a lie.
 *
 *   node scripts/perf/check-photo-weight.mjs
 */
import { processImage } from "../../src/core/media/process.ts";
import { generateDishPhoto, PHOTO_BAND } from "./dish-photo.mjs";

const sizes = [];
for (let seed = 0; seed < 5; seed += 1) {
  const started = Date.now();
  const source = await generateDishPhoto(seed);
  const out = await processImage(new Uint8Array(source));
  sizes.push(out.data.byteLength);
  console.log(
    `seed ${seed}: source ${(source.length / 1000).toFixed(0)} KB -> stored ` +
      `${(out.data.byteLength / 1000).toFixed(0)} KB, ${out.width}x${out.height}, ` +
      `blur ${out.blurDataUrl.length} chars, ${Date.now() - started} ms`,
  );
}

const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
const distinct = new Set(sizes).size;
console.log(`\nmean stored: ${Math.round(mean / 1000)} KB across ${distinct}/${sizes.length} distinct sizes`);
console.log(
  mean >= PHOTO_BAND.minBytes && mean <= PHOTO_BAND.maxBytes
    ? "IN BAND"
    : `OUT OF BAND (want ${PHOTO_BAND.minBytes}-${PHOTO_BAND.maxBytes}) — tune and repeat`,
);
