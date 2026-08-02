/**
 * Storage abstraction.
 *
 * Local disk in development, Cloudflare R2 in production. Keeping this an
 * interface is what makes the local-first decision cheap: no cloud account is
 * needed to build the product, and going live is a driver swap rather than a
 * refactor of every upload path.
 */

export interface StoredObject {
  key: string;
  size: number;
  contentType: string;
}

export interface PutOptions {
  contentType: string;
}

export interface StorageAdapter {
  put(key: string, data: Uint8Array, options: PutOptions): Promise<StoredObject>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** URL a browser can fetch this object from. */
  publicUrl(key: string): string;
}

export class InvalidStorageKeyError extends Error {
  constructor(key: string, reason: string) {
    super(`Invalid storage key ${JSON.stringify(key)}: ${reason}`);
    this.name = "InvalidStorageKeyError";
  }
}

/**
 * Storage keys are attacker-influenced -- they derive from uploads. An
 * unvalidated key like "../../../.env" turns a file upload into arbitrary
 * filesystem read/write on the local driver, and into cross-tenant object
 * access on R2. Validation lives here, in the shared layer, so no driver can
 * forget it.
 */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export function assertSafeKey(key: string): void {
  if (key.length === 0) throw new InvalidStorageKeyError(key, "key is empty");
  if (key.length > 512) throw new InvalidStorageKeyError(key, "key is too long");
  if (!SAFE_KEY.test(key)) {
    throw new InvalidStorageKeyError(
      key,
      "only letters, digits, dot, underscore, hyphen and slash are allowed, and it must not start with a separator",
    );
  }
  if (key.includes("..")) {
    throw new InvalidStorageKeyError(key, "path traversal is not allowed");
  }
  if (key.includes("//")) {
    throw new InvalidStorageKeyError(key, "empty path segment");
  }
  if (key.endsWith("/")) {
    throw new InvalidStorageKeyError(key, "key must not end with a separator");
  }
}

/** Every uploaded object is namespaced by tenant. */
export function tenantScopedKey(
  tenantId: string,
  ...segments: string[]
): string {
  const key = ["tenants", tenantId, ...segments].join("/");
  assertSafeKey(key);
  return key;
}
