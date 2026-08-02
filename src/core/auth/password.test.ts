import { describe, expect, it } from "vitest";
import {
  hashPassword,
  InvalidPasswordHashError,
  needsRehash,
  verifyPassword,
} from "./password";

describe("password hashing", () => {
  it("accepts the correct password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", stored)).toBe(
      true,
    );
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("Correct horse battery staple", stored)).toBe(
      false,
    );
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("produces a different hash every time for the same password", async () => {
    // Distinct random salts. Identical hashes would reveal which owners share
    // a password, and make one rainbow table cover all of them.
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");

    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("stores its parameters so cost can be raised without breaking logins", async () => {
    const stored = await hashPassword("x");
    const [scheme, cost, blockSize, parallelism] = stored.split("$");

    expect(scheme).toBe("scrypt");
    expect(Number(cost)).toBe(2 ** 15);
    expect(Number(blockSize)).toBe(8);
    expect(Number(parallelism)).toBe(3);
  });

  it("handles unicode and long passwords", async () => {
    const passwords = [
      "كلمة السر",
      "emoji 🍔🍟",
      "a".repeat(400),
    ];

    for (const password of passwords) {
      const stored = await hashPassword(password);
      expect(await verifyPassword(password, stored)).toBe(true);
    }
  });

  it("treats visually identical unicode forms as the same password", async () => {
    // NFKC normalisation. An owner typing on iOS and on Windows can produce
    // different byte sequences for the same visible characters, and without
    // normalising, one of those devices could never log in again.
    const composed = "café"; // e-acute as a single code point
    const decomposed = "café"; // e + combining acute accent
    expect(composed).not.toBe(decomposed);

    const stored = await hashPassword(composed);

    expect(await verifyPassword(decomposed, stored)).toBe(true);
  });

  it("rejects a malformed stored hash instead of silently failing open", async () => {
    for (const bad of ["", "notahash", "bcrypt$1$2$3$4$5", "scrypt$a$b$c$d$e"]) {
      await expect(verifyPassword("x", bad)).rejects.toBeInstanceOf(
        InvalidPasswordHashError,
      );
    }
  });
});

describe("needsRehash", () => {
  it("is false for a hash made with current parameters", async () => {
    expect(needsRehash(await hashPassword("x"))).toBe(false);
  });

  it("is true for weaker parameters", () => {
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$aGFzaA==")).toBe(true);
  });

  it("is true for an unrecognised scheme", () => {
    expect(needsRehash("bcrypt$whatever")).toBe(true);
  });
});
