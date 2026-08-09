/**
 * Operator impersonation.
 *
 * The operator supports clients by entering their admin and seeing exactly
 * what they see. That is a real privilege, so it is deliberate, scoped to one
 * restaurant, and visible: the tenant being acted as travels in a cookie, and
 * the admin renders a banner whenever it is set.
 *
 * The cookie is NOT the authorization. It is client-controlled and may say
 * anything; what decides access is `isPlatformAdmin`, read from the session on
 * the server for every request. A forged cookie therefore buys nothing -- it
 * only chooses WHICH restaurant an operator is already entitled to enter.
 */
export const IMPERSONATION_COOKIE = "operator_acting_as";

export interface AccessInput {
  /** This user has a membership row in `tenantId`. */
  hasMembership: boolean;
  /** From `users.is_platform_admin`, read server-side. Never from a cookie. */
  isPlatformAdmin: boolean;
  /** The tenant this session is currently acting as, or null. */
  impersonatingTenantId: string | null;
  /** The tenant being requested. */
  tenantId: string;
}

/**
 * May this user administer this restaurant?
 *
 * Being a platform admin is deliberately NOT sufficient on its own. Ambient
 * access to every restaurant is how an operator edits a client's prices
 * believing they are in the demo, and it makes the banner meaningless because
 * there is no moment at which impersonation begins.
 */
export function mayAdminister({
  hasMembership,
  isPlatformAdmin,
  impersonatingTenantId,
  tenantId,
}: AccessInput): boolean {
  if (hasMembership) return true;
  return isPlatformAdmin && impersonatingTenantId === tenantId;
}
