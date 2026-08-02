import { createLocalStorage } from "@/core/storage/local";
import type { StorageAdapter } from "@/core/storage/types";
import { env } from "@/env";

/**
 * Composition root for storage. The R2 driver arrives when the first client
 * goes live; until then the interface keeps that swap to a single line here.
 */
function createStorage(): StorageAdapter {
  switch (env.STORAGE_DRIVER) {
    case "local":
      return createLocalStorage({ baseDir: env.STORAGE_LOCAL_DIR });
    case "r2":
      throw new Error(
        "The R2 storage driver is not implemented yet. Set STORAGE_DRIVER=local.",
      );
  }
}

export const storage: StorageAdapter = createStorage();
