# Phase 5 — Operator Console

**Date:** 8 August 2026
**Status:** Approved, not yet implemented

## Why this exists

Phase 4c gave restaurant owners their menu. This gives the operator the
restaurant. Today, bringing a new client into existence means editing
`scripts/db/seed.sql`, running `psql`, and then running
`scripts/create-admin.ts` — three manual steps against a live database, for
every sale. That is the last thing standing between this product and onboarding
a client in front of them.

## Two answers that shaped this

**Nothing is deployed. There is no domain and no hosting yet.** So *real DNS
verification cannot be built honestly*. Verification means telling a restaurant
"point your domain at this address" and then checking that they did; with no
address to name, any such code would be written against a guess and tested
against nothing. It is deferred, and the console says so out loud rather than
showing a green tick it has not earned.

**There is exactly one operator, indefinitely.** So impersonation gets a banner
and a way back, and no audit trail. An `impersonation_events` table protects one
operator from nobody.

## Scope

In:

- List every restaurant, with status and primary domain
- **Create a restaurant, its subdomain, its owner and their login in one form**
- Optionally seed an example menu, for demoing before a client has supplied
  anything
- Suspend and reactivate a restaurant
- Attach and remove additional domains; mark one verified by hand
- Impersonate an owner for support

Out, deliberately:

- **Automatic DNS verification.** See above. The seam is left in one named
  place so it becomes a real check the day there is a host to point at.
- **Operator-only custom CSS.** The roadmap homes it here and
  `theme_settings.custom_css` already exists, unused. No client has asked for
  bespoke styling, and injecting operator CSS creates a surface that the
  nonce-based CSP in Phase 6 would then have to be designed around. The column
  stays; the screen costs nothing to add later, once someone actually wants it.
- **Deleting a restaurant.** `ON DELETE CASCADE` reaches every table a client
  owns. At this scale, suspending is enough and reversible; the console will
  not offer an irreversible action nobody needs yet.
- **Email invitations.** There is no email adapter. The operator sets an
  initial password and tells the owner, exactly as `create-admin.ts` does now.

## The create form is the design

One form, one submit, and the SQL path is gone:

| Field | Notes |
|---|---|
| Restaurant name | Free text |
| Slug | Derived from the name, editable. Validated by the existing `isValidSlug` |
| Currency | ISO 4217. Drives `Intl`, never a hardcoded exponent |
| Timezone | IANA. "Open now" is wrong without it |
| Default language | English or Arabic |
| Owner email | Their login |
| Owner password | Initial password, handed over verbally |
| Start with an example menu | Checkbox, off by default |

On submit, in **one transaction**: insert the tenant, insert
`<slug>.<platform domain>` as a **primary, already-verified** domain, create or
find the owner, and grant them an owner membership.

The subdomain is verified on creation without any DNS check because it is ours.
The platform owns that wildcard; there is nothing for a stranger to hijack, and
the rule that protects the product — only verified domains resolve — exists to
stop someone pointing *their* DNS at us and serving a lookalike. A name we
issued ourselves is not that case.

**`RESERVED_SLUGS` already exists and must be enforced here.** Handing `app` to
a restaurant would put their site on the admin origin, which is where session
cookies live. `core/tenant/hostname.ts` was written for this moment.

### An existing email must never have its password reset

If the owner's email already belongs to a user, that user is reused and given a
membership — the schema's own comment says a person may own several
restaurants. The submitted password is **ignored** in that case, and the form
says so.

Overwriting it would let anyone with the console change any existing account's
password, including another operator's. That is a privilege-escalation path
hiding inside a convenience.

### Atomicity, and where it stops

Tenant, domain, user and membership are one transaction: a restaurant either
exists completely or not at all. The **example menu is written afterwards**, in
its own transaction, because menu tables are under RLS and need a tenant context
that cannot exist until the tenant does. If that second step fails, the result
is a real restaurant with an empty menu — visible in the console, and fixable
with the quick-add row in seconds. That is the right failure to accept.

## Domains, stated honestly

The restaurant's own subdomain is created and verified with it. Beyond that, the
operator can attach a custom hostname, which is stored **unverified** and
therefore does not resolve.

The screen says plainly that automatic DNS checking is not built, and that the
verified toggle is a manual assertion until it is. A status UI that implied a
check was happening would be worse than no status UI: it would be trusted.

`normalizeHostname` is applied to anything typed in — the Host header is
attacker-controlled and inconsistently formatted, and a hostname stored with a
port or stray casing is a tenant that silently cannot be reached.

## Impersonation

A "Sign in as this owner" button. The operator lands in that restaurant's admin,
sees exactly what the owner sees, and a bar across the top names the restaurant
and offers a way out.

**Mechanism: a cookie on the admin origin naming the tenant being acted as.**
No migration. The security property does not live in the cookie:
`users.is_platform_admin` is read from the session on the server for every
request, and the cookie only carries *which* restaurant. Someone forging it
gains nothing they did not already have — a non-operator with a perfect forgery
still fails the admin check.

This changes `requireMembership`, which is the single most important
authorization function in the product. The new rule, exactly:

> Access is granted if the user has a membership in this tenant, **or** the user
> is a platform admin **and** is currently impersonating *this* tenant.

Being a platform admin is deliberately **still not** enough on its own — that
property is asserted in the existing test suite and in `sandbox.ts`, and it
stays true. Impersonation is a deliberate, scoped, one-tenant-at-a-time act.

An impersonating operator has no membership row, so one is synthesised from the
tenant for the admin UI to render. It carries the tenant's real name and
currency; anything else would render a client's prices wrong.

## Repository additions

A new `src/core/platform/repository.ts`, taking a plain `Database` rather than a
`TenantSession` — like `core/auth/repository.ts` already does, and for the same
reason: `tenants`, `domains`, `users` and `memberships` are all read and written
*before* a tenant context can exist, and are deliberately outside RLS.

| Function | Notes |
|---|---|
| `listRestaurants(db)` | Every tenant with its primary domain |
| `findRestaurant(db, tenantId)` | One tenant with all its domains |
| `createRestaurant(db, input)` | Tenant + domain + owner + membership, one transaction |
| `setRestaurantStatus(db, tenantId, status)` | trial / active / suspended |
| `attachDomain(db, tenantId, hostname)` | Stored unverified |
| `setDomainVerified(db, domainId, verified)` | The manual assertion |
| `removeDomain(db, domainId)` | Refuses the last remaining domain |
| `findTenantById(db, tenantId)` | Feeds the synthesised membership |

## Server actions and guards

`requirePlatformAdmin()` joins `requireSession` and `requireMembership` in
`src/server/auth.ts`. Every operator action calls it itself — a layout guard does
not run for an action invoked directly, which is already a rule in this codebase.

Actions in `src/app/admin/operator/actions.ts`: `createRestaurant`,
`setRestaurantStatus`, `attachDomain`, `setDomainVerified`, `removeDomain`,
`startImpersonating`, `stopImpersonating`.

No `redirect()` from an action — return a target and let the client call
`window.location.assign()`, because the admin is reached by a host rewrite and
`redirect()` resolves against the wrong route tree.

## Routes

`/admin/operator/*`. A static segment beside `/admin/[tenantId]`, which Next
resolves in favour of the static one — the same arrangement `/admin/login`
already relies on.

| Route | Screen |
|---|---|
| `operator/page.tsx` | Every restaurant: name, slug, status, domain |
| `operator/new/page.tsx` | The create form |
| `operator/[tenantId]/page.tsx` | Status, domains, impersonate |
| `operator/layout.tsx` | `requirePlatformAdmin` guard and nav |

The tenant admin layout gains the impersonation banner, since that is where an
impersonating operator actually is.

`/admin` itself needs one change. It currently tells a user with no memberships
"your account is not linked to a restaurant" — which is exactly the state a
platform operator is in before they impersonate anyone. It gains a link to the
console for platform admins, so signing in as the operator does not dead-end.

## Testing

Integration, against real PostgreSQL:

- Creating a restaurant yields a tenant, a **verified primary subdomain**, an
  owner user and an owner membership — and the site resolves by that hostname
- A duplicate slug is refused, and leaves nothing behind
- A reserved slug (`app`) is refused
- An existing email is reused, gains a membership, and **its password hash is
  unchanged** — asserted directly, because this is a privilege-escalation guard
- An attached custom domain is unverified, and does not resolve until marked
- Removing the last remaining domain is refused, since a restaurant with no
  hostname is unreachable and invisible to its own owner

Authorization — the matrix that matters, since `requireMembership` changed:

| Who | Can reach |
|---|---|
| Owner of A | A only. Not B, not `/operator` |
| Platform admin, not impersonating | Their own memberships only |
| Platform admin impersonating A | A. **Not B** |
| Non-admin with a forged impersonation cookie | Nothing |

E2E — the test that matters:

**Onboard a restaurant from nothing.** The operator signs in, creates a
restaurant in the browser, signs out. The new owner signs in with the password
just set, lands on their empty menu, adds a dish. The public site answers on the
new subdomain and shows it. That is the sale, start to finish, and it should
exist as a test rather than as a hope.

Plus: a restaurant owner hitting `/operator` gets nothing.

Both use the existing `sandbox` pattern — provisioned per project and per
parallel slot, isolation by data. Created restaurants use a slug carrying the
project and slot, and the spec cleans up after itself so a second run does not
collide on the unique slug.

## Risks

| Risk | Mitigation |
|---|---|
| `requireMembership` is the product's central authorization check and this changes it | The four-row matrix above is tested explicitly, including a forged cookie. The "platform admin alone is not access" property is preserved and asserted |
| Operator sets a password for an email that already exists | The password is ignored for existing users, and a test asserts the hash is unchanged |
| A restaurant is created with no way to reach it | The subdomain is created in the same transaction as the tenant, not as a follow-up step |
| Manual domain verification becomes permanent | It is named as unbuilt in the UI and in this spec, with the seam in one place |
| Deferred custom CSS turns out to be needed for a sale | The column exists; the screen is a textarea and an action. Revisit when a client asks, not before |
