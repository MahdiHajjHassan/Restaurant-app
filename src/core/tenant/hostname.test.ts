import { describe, expect, it } from "vitest";
import { isValidSlug, normalizeHostname, RESERVED_SLUGS } from "./hostname";

describe("normalizeHostname", () => {
  it.each([
    ["Example.COM", "example.com"],
    ["example.com:3000", "example.com"],
    ["  example.com  ", "example.com"],
    // A trailing dot is the fully-qualified form and must not create a second,
    // unreachable spelling of the same tenant.
    ["example.com.", "example.com"],
    ["EXAMPLE.com.:443", "example.com"],
    ["sub.domain.example.com", "sub.domain.example.com"],
    ["localhost:3000", "localhost"],
    // IPv6 literals are full of colons, so port stripping must not corrupt them.
    ["[::1]:3000", "[::1]"],
    ["[2001:db8::1]", "[2001:db8::1]"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(normalizeHostname(input)).toBe(expected);
  });
});

describe("isValidSlug", () => {
  it.each(["alpha", "alpha-grill", "a1", "my-restaurant-2"])(
    "accepts %j",
    (slug) => {
      expect(isValidSlug(slug)).toBe(true);
    },
  );

  it.each([
    ["-leading", "leading hyphen"],
    ["trailing-", "trailing hyphen"],
    ["Upper", "uppercase"],
    ["has space", "space"],
    ["has_underscore", "underscore"],
    ["", "empty"],
    ["a".repeat(64), "too long for a DNS label"],
  ])("rejects %j (%s)", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });

  // Handing "app" to a restaurant would let their site occupy the admin origin,
  // which is where session cookies live.
  it.each([...RESERVED_SLUGS])("rejects the reserved slug %j", (slug) => {
    expect(isValidSlug(slug)).toBe(false);
  });
});
