import sharp from "sharp";

/** Enough for a retina card without unbounded storage cost. */
const MAX_DIMENSION = 1600;

/** Wide enough to suggest the photo, small enough to inline in the document. */
const BLUR_WIDTH = 16;

export interface ProcessedImage {
  data: Uint8Array;
  width: number;
  height: number;
  contentType: string;
  /** Tiny base64 WebP, so cards do not shift as photos load. */
  blurDataUrl: string;
}

/**
 * Normalise an owner-uploaded photo.
 *
 * `.rotate()` with no argument applies the EXIF orientation tag, and it must
 * come FIRST: re-encoding discards metadata, so skipping it leaves every
 * portrait phone photo on its side with the tag that would have corrected it
 * now gone.
 *
 * Re-encoding to WebP is also what strips EXIF, GPS included. That is a privacy
 * requirement rather than a size optimisation -- phone photos carry the
 * coordinates of the restaurant, and often of the owner's home.
 *
 * `sharp` is Node-only, so this module cannot be imported by the React Native
 * app in roadmap R4. That app consumes already-processed media over the API and
 * never processes, so this is not a break in the core/ boundary.
 */
export async function processImage(input: Uint8Array): Promise<ProcessedImage> {
  const source = Buffer.from(input);

  const { data, info } = await sharp(source)
    .rotate()
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

  const blur = await sharp(source)
    .rotate()
    .resize({ width: BLUR_WIDTH })
    .webp({ quality: 40 })
    .toBuffer();

  return {
    data: new Uint8Array(data),
    width: info.width,
    height: info.height,
    contentType: "image/webp",
    blurDataUrl: `data:image/webp;base64,${blur.toString("base64")}`,
  };
}
