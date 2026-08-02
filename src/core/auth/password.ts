import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

/**
 * Explicit wrapper rather than promisify(): promisify resolves to scrypt's
 * three-argument overload and drops the options parameter, which silently
 * loses the cost settings below.
 */
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

/*
 * Password hashing with scrypt.
 *
 * Parameters are an OWASP-accepted set (N=2^15, r=8, p=3). They are stored
 * alongside each hash rather than assumed, so raising the cost later does not
 * invalidate existing passwords: old hashes keep verifying with their own
 * parameters and can be upgraded on next successful login.
 *
 * scrypt from Node core rather than an argon2 package: no native module to
 * fail on Windows or in CI, and it is a vetted KDF at these settings.
 */
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELISM = 3;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

// Node's default maxmem (32 MB) is below what these parameters need
// (128 * N * r = 33.5 MB), so it must be raised explicitly or scrypt throws.
const MAX_MEM = 128 * COST * BLOCK_SIZE * 2;

export class InvalidPasswordHashError extends Error {
  constructor(reason: string) {
    super(`Malformed password hash: ${reason}`);
    this.name = "InvalidPasswordHashError";
  }
}

async function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelism: number,
): Promise<Buffer> {
  return scryptAsync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: cost,
    r: blockSize,
    p: parallelism,
    maxmem: MAX_MEM,
  });
}

/** Returns `scrypt$N$r$p$salt$hash`, everything needed to verify it later. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM);

  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELISM,
    salt.toString("base64"),
    key.toString("base64"),
  ].join("$");
}

/**
 * Verifies a password against a stored hash.
 *
 * Comparison is timing-safe: a byte-by-byte early return leaks how much of the
 * hash matched, which is enough to recover it a byte at a time.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") {
    throw new InvalidPasswordHashError("expected scrypt$N$r$p$salt$hash");
  }

  const [, costRaw, blockRaw, parallelRaw, saltRaw, keyRaw] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];

  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallelism = Number(parallelRaw);
  if (!cost || !blockSize || !parallelism) {
    throw new InvalidPasswordHashError("non-numeric parameters");
  }

  const expected = Buffer.from(keyRaw, "base64");
  const actual = await derive(
    password,
    Buffer.from(saltRaw, "base64"),
    cost,
    blockSize,
    parallelism,
  );

  // timingSafeEqual throws on length mismatch, so guard first.
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/**
 * True when a hash was made with weaker parameters than we now use, so it can
 * be re-hashed during a successful login while the plaintext is in hand.
 */
export function needsRehash(stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return true;
  return (
    Number(parts[1]) < COST ||
    Number(parts[2]) < BLOCK_SIZE ||
    Number(parts[3]) < PARALLELISM
  );
}
