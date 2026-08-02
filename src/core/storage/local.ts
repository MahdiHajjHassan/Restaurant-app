import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertSafeKey,
  type PutOptions,
  type StorageAdapter,
  type StoredObject,
} from "./types";

export interface LocalStorageOptions {
  /** Directory uploads are written to. Created on demand. */
  baseDir: string;
  /** URL prefix the route handler serves these objects from. */
  publicPrefix?: string;
}

/**
 * Development storage driver: writes to the local filesystem.
 *
 * Not for production -- serverless filesystems are ephemeral and per-instance.
 * The R2 driver implements the same interface and swaps in via STORAGE_DRIVER.
 */
export function createLocalStorage({
  baseDir,
  publicPrefix = "/storage",
}: LocalStorageOptions): StorageAdapter {
  const root = path.resolve(baseDir);

  /**
   * Resolve a key to an absolute path, then verify the result is still inside
   * the storage root. assertSafeKey already rejects traversal; this is a second,
   * independent check because a filesystem escape is severe enough to be worth
   * defending twice -- the same reasoning as RLS behind the repository layer.
   */
  function resolvePath(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(root, key);
    const rel = path.relative(root, full);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Resolved path escapes storage root: ${key}`);
    }
    return full;
  }

  return {
    async put(
      key: string,
      data: Uint8Array,
      options: PutOptions,
    ): Promise<StoredObject> {
      const full = resolvePath(key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
      return { key, size: data.byteLength, contentType: options.contentType };
    },

    async get(key: string): Promise<Uint8Array | null> {
      const full = resolvePath(key);
      try {
        return new Uint8Array(await readFile(full));
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async delete(key: string): Promise<void> {
      await rm(resolvePath(key), { force: true });
    },

    async exists(key: string): Promise<boolean> {
      try {
        await stat(resolvePath(key));
        return true;
      } catch (error) {
        if (isNotFound(error)) return false;
        throw error;
      }
    },

    publicUrl(key: string): string {
      assertSafeKey(key);
      return `${publicPrefix}/${key}`;
    },
  };
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
