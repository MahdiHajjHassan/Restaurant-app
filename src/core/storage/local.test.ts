import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createLocalStorage } from "./local";
import { InvalidStorageKeyError, type StorageAdapter } from "./types";

describe("local storage adapter", () => {
  let dir: string;
  let storage: StorageAdapter;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "restaurant-storage-"));
    storage = createLocalStorage({ baseDir: dir });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips an object", async () => {
    const data = new TextEncoder().encode("hello");
    const stored = await storage.put("tenants/t1/items/a.txt", data, {
      contentType: "text/plain",
    });

    expect(stored).toEqual({
      key: "tenants/t1/items/a.txt",
      size: 5,
      contentType: "text/plain",
    });
    expect(await storage.get("tenants/t1/items/a.txt")).toEqual(data);
    expect(await storage.exists("tenants/t1/items/a.txt")).toBe(true);
  });

  it("returns null for a missing object rather than throwing", async () => {
    expect(await storage.get("tenants/t1/items/missing.txt")).toBeNull();
    expect(await storage.exists("tenants/t1/items/missing.txt")).toBe(false);
  });

  it("deletes an object, and deleting twice is not an error", async () => {
    await storage.put("tenants/t1/a.txt", new Uint8Array([1]), {
      contentType: "application/octet-stream",
    });

    await storage.delete("tenants/t1/a.txt");
    expect(await storage.exists("tenants/t1/a.txt")).toBe(false);
    await expect(storage.delete("tenants/t1/a.txt")).resolves.toBeUndefined();
  });

  it("cannot read a file outside the storage root", async () => {
    // A real secret sitting next to the storage directory.
    const secret = path.join(path.dirname(dir), "secret.txt");
    await writeFile(secret, "do not leak");

    await expect(
      storage.get(`../${path.basename(secret)}`),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);

    await rm(secret, { force: true });
  });

  it("cannot write outside the storage root", async () => {
    await expect(
      storage.put("../escaped.txt", new Uint8Array([1]), {
        contentType: "text/plain",
      }),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
  });

  it("builds public URLs under the configured prefix", () => {
    expect(storage.publicUrl("tenants/t1/a.webp")).toBe(
      "/storage/tenants/t1/a.webp",
    );
  });
});
