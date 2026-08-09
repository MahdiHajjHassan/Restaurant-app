import { describe, expect, it } from "vitest";
import { mayAdminister } from "./impersonation";

/**
 * The product's central authorization rule, as a truth table.
 *
 * One restaurant reaching another's admin is the failure that would end this
 * product, so the rule lives here -- no database, no cookies, no framework --
 * where every combination can be enumerated rather than sampled.
 */

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("mayAdminister", () => {
  it("lets a member in", () => {
    expect(
      mayAdminister({
        hasMembership: true,
        isPlatformAdmin: false,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });

  it("keeps a signed-in stranger out", () => {
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: false,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("does NOT let a platform admin in merely for being one", () => {
    // The property the rest of the suite already asserts, and which the
    // console must not quietly repeal. Operating on a restaurant is a
    // deliberate act, not an ambient privilege.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: null,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("lets a platform admin into the tenant they are impersonating", () => {
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: TENANT,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });

  it("scopes impersonation to ONE restaurant at a time", () => {
    // Impersonating A must not open B. Without this the cookie would be a
    // master key rather than a scoped one.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: true,
        impersonatingTenantId: OTHER,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("ignores an impersonation claim from a non-admin", () => {
    // The cookie is client-controlled, so this is the forgery case: it may
    // say anything, and it buys nothing without the server-side admin flag.
    expect(
      mayAdminister({
        hasMembership: false,
        isPlatformAdmin: false,
        impersonatingTenantId: TENANT,
        tenantId: TENANT,
      }),
    ).toBe(false);
  });

  it("still lets a member in while they impersonate elsewhere", () => {
    // An operator who owns their own demo restaurant must not lose access to
    // it because they are currently helping a client.
    expect(
      mayAdminister({
        hasMembership: true,
        isPlatformAdmin: true,
        impersonatingTenantId: OTHER,
        tenantId: TENANT,
      }),
    ).toBe(true);
  });
});
