/** 8 MB. Phone photos are routinely 4-6 MB; a smaller cap rejects real uploads. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImageType = "jpeg" | "png" | "webp";

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Identify an image by its magic bytes.
 *
 * The declared Content-Type arrives from the client and is therefore never
 * consulted -- a file renamed to .jpg would otherwise land on disk and be
 * served back from our own origin.
 *
 * SVG is deliberately absent from the allowlist. It is a genuine image format,
 * but it can carry script, and same-origin script is exactly what a menu site
 * must not serve on a restaurant owner's behalf.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";

  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }

  // WebP is RIFF with a WEBP fourcc at offset 8. RIFF alone is also WAV and AVI.
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export type UploadValidation =
  | { ok: true; type: ImageType }
  | { ok: false; reason: string };

/**
 * Reasons are written for a restaurant owner holding a phone, not for a
 * developer reading a log. Each one says what to do next, because "Upload
 * failed" is a support call.
 */
export function validateUpload(bytes: Uint8Array): UploadValidation {
  if (bytes.byteLength === 0) {
    return { ok: false, reason: "That file is empty. Try choosing it again." };
  }

  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    const limit = MAX_UPLOAD_BYTES / 1024 / 1024;
    return {
      ok: false,
      reason: `That photo is bigger than ${limit} MB. Take a new one, or pick a smaller size when sharing it.`,
    };
  }

  const type = sniffImageType(bytes);
  if (type === null) {
    return {
      ok: false,
      reason: "That file is not a photo. Choose a JPEG, PNG, or WebP image.",
    };
  }

  return { ok: true, type };
}
