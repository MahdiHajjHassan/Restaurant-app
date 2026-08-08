/**
 * Where the browser suite points.
 *
 * The port is configurable because `reuseExistingServer` is on locally: with a
 * hardcoded 3000, running the suite while `npm run dev` is up silently tests
 * whatever that server happens to be serving -- another branch, a stale build --
 * and reports it as a pass. `E2E_PORT=3100 npm run test:e2e` gets its own server.
 *
 * Nothing here may be inlined back into the specs: PLATFORM_DOMAIN is handed to
 * the app from the same constant, so the app's host routing and the suite's
 * expectations cannot drift apart.
 */
export const PORT = Number(process.env.E2E_PORT ?? 3000);

/** Must equal the app's PLATFORM_DOMAIN, or host routing disagrees with us. */
export const PLATFORM_DOMAIN = `localhost:${PORT}`;

export const PLATFORM = `http://${PLATFORM_DOMAIN}`;

/** The admin console, on one origin so sessions stay scoped to it. */
export const ADMIN = `http://app.${PLATFORM_DOMAIN}`;

/** A tenant's public site. `*.localhost` resolves inside Chromium only. */
export const site = (hostname: string): string => `http://${hostname}:${PORT}`;
