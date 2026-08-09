import sharp from "sharp";

/**
 * Generates dish photographs that weigh what photographs weigh.
 *
 * The existing seeded placeholders are flat gradients: 3,132 bytes each and
 * byte-identical. Measuring the grid preset against those would return a score
 * near 100 that means nothing, because a photograph is one to two orders of
 * magnitude heavier and the whole question is what ninety of them cost.
 *
 * A file's size after compression comes from detail that survives it, at every
 * scale at once: broad tonal drift, the texture of the food, and fine sensor
 * grain. Each is a separate noise layer below. A gradient has none of them,
 * which is exactly why it compresses to nothing.
 */

/** The band a phone photo lands in after processImage() re-encodes it. */
export const PHOTO_BAND = { minBytes: 100_000, maxBytes: 400_000 };

const WIDTH = 2400;
const HEIGHT = 1800;

/** Mulberry32 — deterministic, so a given seed always yields the same photo. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One octave of noise, scaled up to full size and faded.
 *
 * Opacity rides the alpha channel rather than a composite option: sharp's
 * composite() takes no opacity, so the overlay has to carry it itself.
 *
 * Handed to composite() as a RAW buffer rather than a PNG. Encoding three
 * 2400x1800 layers to PNG only for sharp to decode them again cost about eight
 * of the eleven seconds each photo took, and ninety photos made that the
 * difference between a two-minute fixture and an eighteen-minute one.
 */
async function noiseLayer(random, width, height, blurRadius, opacity) {
  const channels = 3;
  const pixels = Buffer.alloc(width * height * channels);
  for (let i = 0; i < pixels.length; i += 1) {
    pixels[i] = Math.floor(random() * 256);
  }

  let layer = sharp(pixels, { raw: { width, height, channels } }).resize(
    WIDTH,
    HEIGHT,
    { kernel: "cubic" },
  );
  if (blurRadius > 0) layer = layer.blur(blurRadius);

  return {
    input: await layer.ensureAlpha(opacity).raw().toBuffer(),
    raw: { width: WIDTH, height: HEIGHT, channels: 4 },
    blend: "overlay",
  };
}

/**
 * A plated dish, as a phone would photograph it: 2400x1800, JPEG, and unique
 * per seed so ninety of them cannot be served from one cache entry.
 */
export async function generateDishPhoto(seed) {
  const random = rng(seed);

  // Warm plate-and-food tones, varied per dish so no two photos are alike.
  const hue = Math.floor(random() * 60);
  const base = { r: 120 + hue, g: 80 + Math.floor(random() * 50), b: 55 };

  /*
   * A tint per dish, so ninety cards are not ninety identical brown discs.
   * Purely cosmetic -- it does not move the file size, which is what this
   * fixture exists to control -- but a page of visibly identical photos reads
   * as a rendering bug to anyone who opens it.
   */
  const tints = [
    [1.0, 0.68, 0.42], // grilled meat
    [0.55, 0.85, 0.45], // herbs and greens
    [1.0, 0.92, 0.72], // creams and dairy
    [0.95, 0.45, 0.35], // tomato and pepper
    [0.98, 0.82, 0.35], // saffron and pastry
    [0.72, 0.62, 0.85], // aubergine and beet
  ];
  const tint = tints[seed % tints.length];

  const plateX = WIDTH / 2;
  const plateY = HEIGHT / 2;
  const plateR = 620 + Math.floor(random() * 120);

  /*
   * Garnish, in three populations.
   *
   * Hard edges are what cost bytes. Grain does not survive the downscale to
   * 1600px -- a good resampling kernel averages it away -- so the weight has to
   * come from structure large enough to still be structure afterwards: pieces,
   * then seeds, then herb strands. This is the same reason a photograph of a
   * salad is heavier than a photograph of a soup.
   *
   * Every element uses fill-opacity / stroke-opacity, never `opacity`. The
   * `opacity` property applies to an element as a GROUP, so librsvg allocates
   * and composites an isolated 2400x1800 buffer per shape. Measured on these
   * 1,580 elements: 10,375 ms with `opacity`, 75 ms with `fill-opacity`.
   */
  const onPlate = (spread = 0.82) => {
    const angle = random() * Math.PI * 2;
    const dist = Math.sqrt(random()) * plateR * spread;
    return [plateX + Math.cos(angle) * dist, plateY + Math.sin(angle) * dist];
  };

  const pieces = Array.from({ length: 420 }, () => {
    const [cx, cy] = onPlate();
    const rr = 8 + random() * 30;
    const shade = Math.floor(random() * 200);
    return (
      `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" ` +
      `rx="${rr.toFixed(1)}" ry="${(rr * (0.55 + random() * 0.8)).toFixed(1)}" ` +
      `transform="rotate(${(random() * 360).toFixed(0)} ${cx.toFixed(1)} ${cy.toFixed(1)})" ` +
      `fill="rgb(${Math.floor(shade * tint[0])},${Math.floor(shade * tint[1])},${Math.floor(shade * tint[2])})" ` +
      `fill-opacity="${(0.45 + random() * 0.55).toFixed(2)}"/>`
    );
  }).join("");

  const seeds = Array.from({ length: 900 }, () => {
    const [cx, cy] = onPlate(0.9);
    const rr = 2.5 + random() * 6;
    const bright = 150 + Math.floor(random() * 105);
    return (
      `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rr.toFixed(1)}" ` +
      `fill="rgb(${bright},${Math.floor(bright * 0.9)},${Math.floor(bright * 0.6)})" ` +
      `fill-opacity="${(0.5 + random() * 0.5).toFixed(2)}"/>`
    );
  }).join("");

  const herbs = Array.from({ length: 260 }, () => {
    const [cx, cy] = onPlate(0.86);
    const len = 18 + random() * 70;
    const angle = random() * Math.PI * 2;
    const green = 90 + Math.floor(random() * 90);
    return (
      `<line x1="${cx.toFixed(1)}" y1="${cy.toFixed(1)}" ` +
      `x2="${(cx + Math.cos(angle) * len).toFixed(1)}" ` +
      `y2="${(cy + Math.sin(angle) * len).toFixed(1)}" ` +
      `stroke="rgb(${Math.floor(green * 0.5)},${green},${Math.floor(green * 0.4)})" ` +
      `stroke-width="${(1.5 + random() * 4).toFixed(1)}" ` +
      `stroke-opacity="${(0.4 + random() * 0.5).toFixed(2)}"/>`
    );
  }).join("");

  const speckles = pieces + seeds + herbs;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs>
      <radialGradient id="cloth" cx="50%" cy="45%" r="75%">
        <stop offset="0%" stop-color="rgb(${base.r},${base.g},${base.b})"/>
        <stop offset="100%" stop-color="rgb(${Math.floor(base.r * 0.42)},${Math.floor(base.g * 0.42)},${Math.floor(base.b * 0.5)})"/>
      </radialGradient>
      <radialGradient id="plate" cx="42%" cy="38%" r="70%">
        <stop offset="0%" stop-color="#f2ece1"/>
        <stop offset="70%" stop-color="#ddd4c6"/>
        <stop offset="100%" stop-color="#b8ac9b"/>
      </radialGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#cloth)"/>
    <ellipse cx="${plateX}" cy="${plateY}" rx="${plateR}" ry="${plateR * 0.94}" fill="url(#plate)"/>
    <ellipse cx="${plateX}" cy="${plateY}" rx="${plateR * 0.72}" ry="${plateR * 0.67}" fill="rgb(${Math.floor(base.r * 0.75)},${Math.floor(base.g * 0.62)},${Math.floor(base.b * 0.55)})" fill-opacity="0.9"/>
    ${speckles}
  </svg>`;

  return sharp(Buffer.from(svg))
    .composite([
      await noiseLayer(random, 300, 225, 12, 0.55), // broad tonal drift
      await noiseLayer(random, 900, 675, 2, 0.5), // food texture
      // At output resolution, so it is still texture after the 1600px resize
      // rather than averaged into flat colour.
      await noiseLayer(random, 1600, 1200, 0, 0.4),
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
