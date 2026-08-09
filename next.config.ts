import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Server Actions default to a 1 MB request body, which rejects essentially
     * every photo taken on a phone. The failure surfaces as a generic action
     * error rather than a size message, so to the owner it looks like a broken
     * upload button.
     *
     * Kept above the 8 MB cap in core/media/validate.ts so an oversized upload
     * is refused by OUR check, with a message naming the limit -- rather than
     * by the framework, with one that does not.
     */
    serverActions: { bodySizeLimit: "10mb" },

    /*
     * Inline the stylesheet instead of linking it.
     *
     * The whole product ships one 7.5 KB stylesheet, and as a separate request
     * it blocks the first paint for a round trip -- expensive on a phone at
     * 150 ms RTT, which is the connection this menu is read on.
     *
     * This is build-time Tailwind output with no user input in it. Owner-
     * supplied colours still travel as a React inline `style` object on the
     * page element, never as CSS text, so the injection surface that decision
     * closed stays closed.
     *
     * Note for Phase 6: the nonce-based CSP has to cover this <style> tag.
     * Next applies the request nonce to it when one is present, so the CSP can
     * stay free of 'unsafe-inline' -- but it is now a thing the policy must
     * account for rather than one it can ignore.
     */
    inlineCss: true,
  },
};

export default nextConfig;
